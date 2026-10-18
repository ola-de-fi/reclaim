import { getAddress, isAddress } from "viem";
import { createClientFactory } from "@/lib/scanner/clients";
import { getAdapters, runScan } from "@/lib/scanner";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Full-history scans take ~10-20s on the public RPC; don't let the serverless default kill them.
export const maxDuration = 60;

const limiter = createRateLimiter({ limit: 10, windowMs: 60_000 });
const getClient = createClientFactory();

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

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await events.next();
      if (done) controller.close();
      else controller.enqueue(encoder.encode(JSON.stringify(value) + "\n"));
    },
    async cancel() {
      await events.return(undefined);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-RateLimit-Remaining": String(limit.remaining),
    },
  });
}
