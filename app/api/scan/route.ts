import { getAddress, isAddress } from "viem";
import { createClientFactory } from "@/lib/scanner/clients";
import { getAdapters, runScan } from "@/lib/scanner";
import type { ScanEvent } from "@/lib/scanner/engine";
import { clientIp, createConcurrencyGate, createRateLimiter } from "@/lib/rate-limit";
import { createScanCache } from "@/lib/scan-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Full-history scans take ~10-20s on the public RPC; don't let the serverless default kill them.
export const maxDuration = 60;

const limiter = createRateLimiter({ limit: 10, windowMs: 60_000 });
// Global cap on live scans per instance, to protect the shared rate-limited RPC.
// SCAN_MAX_CONCURRENT is read once at module load (overridable for tests).
const gate = createConcurrencyGate(Number(process.env.SCAN_MAX_CONCURRENT) || 8);
// Completed scans replayed for 60s (page refresh, shared links) without touching the RPC.
const cache = createScanCache<ScanEvent>({ ttlMs: 60_000, maxEntries: 500 });
const getClient = createClientFactory();

const NDJSON_HEADERS = {
  "Content-Type": "application/x-ndjson; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

/**
 * GET /api/scan?address=0x…
 * Streams newline-delimited JSON ScanEvents as each adapter finishes.
 * Read-only: no signing, no storage. Addresses are not logged.
 */
export async function GET(req: Request) {
  const limit = limiter(clientIp(req.headers));
  if (!limit.ok) {
    return Response.json(
      { error: "Too many scans. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
    );
  }

  const raw = new URL(req.url).searchParams.get("address")?.trim() ?? "";
  if (!isAddress(raw, { strict: false })) {
    return Response.json({ error: "Enter a valid 0x wallet address." }, { status: 400 });
  }
  const address = getAddress(raw);
  const encoder = new TextEncoder();
  const headers = { ...NDJSON_HEADERS, "X-RateLimit-Remaining": String(limit.remaining) };

  const cached = cache.get(address);
  if (cached) {
    const body = cached.map((e) => JSON.stringify(e) + "\n").join("");
    return new Response(encoder.encode(body), { headers: { ...headers, "X-Scan-Cache": "hit" } });
  }

  const release = gate.tryAcquire();
  if (!release) {
    return Response.json(
      { error: "Busy — try again in a few seconds." },
      { status: 503, headers: { "Retry-After": "5" } },
    );
  }
  // Release on client disconnect even if the stream is never pulled again.
  req.signal.addEventListener("abort", release, { once: true });

  // runScan is a lazy generator: nothing runs (or throws) until the first pull.
  const events = runScan(
    address,
    getAdapters(),
    (signal) => ({
      getClient,
      signal,
      logger: { info() {}, warn: (m, meta) => console.warn(`[scan] ${m}`, meta ?? "") },
    }),
    { signal: req.signal },
  );

  const collected: ScanEvent[] = [];
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await events.next();
        if (done) {
          release();
          if (collected.at(-1)?.type === "scan_done" && !req.signal.aborted) {
            cache.set(address, collected);
          }
          controller.close();
          return;
        }
        collected.push(value);
        controller.enqueue(encoder.encode(JSON.stringify(value) + "\n"));
      } catch (err) {
        release();
        controller.error(err);
      }
    },
    async cancel() {
      release();
      await events.return(undefined);
    },
  });

  return new Response(stream, { headers });
}
