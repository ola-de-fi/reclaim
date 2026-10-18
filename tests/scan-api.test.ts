import { afterEach, describe, expect, it, vi } from "vitest";
import { createRateLimiter, clientIp } from "@/lib/rate-limit";
import { scanReducer, type ScanState } from "@/lib/scanner/use-scan";
import { summarize, type ScanEvent } from "@/lib/scanner/engine";

vi.mock("server-only", () => ({}));

describe("rate limiter", () => {
  it("allows up to the limit per window, then resets", () => {
    const check = createRateLimiter({ limit: 2, windowMs: 1000 });
    expect(check("a", 0).ok).toBe(true);
    expect(check("a", 1).ok).toBe(true);
    expect(check("a", 2)).toMatchObject({ ok: false, retryAfterSec: 1 });
    expect(check("b", 2).ok).toBe(true);
    expect(check("a", 1001).ok).toBe(true);
  });

  it("reads the client IP from proxy headers", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }), false)).toBe(
      "10.0.0.1",
    );
    expect(clientIp(new Headers(), false)).toBe("unknown");
  });
});

describe("GET /api/scan", () => {
  async function call(query: string, env: Record<string, string> = {}) {
    vi.resetModules();
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
    const { GET } = await import("@/app/api/scan/route");
    return GET(
      new Request(`http://localhost/api/scan${query}`, {
        headers: { "x-forwarded-for": "9.9.9.9" },
      }),
    );
  }

  it("rejects an invalid address", async () => {
    const res = await call("?address=nope");
    expect(res.status).toBe(400);
  });

  it("streams NDJSON events ending in scan_done", async () => {
    const res = await call("?address=0x1111111111111111111111111111111111111111", {
      SCANNER_MOCK: "1",
      NODE_ENV: "test",
    });
    expect(res.headers.get("content-type")).toContain("application/x-ndjson");
    const events = (await res.text())
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l) as ScanEvent);
    expect(events[0]?.type).toBe("scan_started");
    expect(events.at(-1)).toMatchObject({
      type: "scan_done",
      summary: { claimableUsd: 96, pendingUsd: 812.5 },
    });
    vi.unstubAllEnvs();
  });

  it("returns 429 after 10 scans a minute from one IP", async () => {
    vi.resetModules();
    const { GET } = await import("@/app/api/scan/route");
    const req = () =>
      GET(
        new Request("http://localhost/api/scan?address=bad", {
          headers: { "x-forwarded-for": "5.5.5.5" },
        }),
      );
    for (let i = 0; i < 10; i++) expect((await req()).status).toBe(400);
    const res = await req();
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBeTruthy();
  });
});

describe("GET /api/scan hardening", () => {
  const A = "0x1111111111111111111111111111111111111111";
  const B = "0x2222222222222222222222222222222222222222";

  async function load(env: Record<string, string> = {}) {
    vi.resetModules();
    vi.stubEnv("SCANNER_MOCK", "1");
    vi.stubEnv("NODE_ENV", "test");
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
    const { GET } = await import("@/app/api/scan/route");
    return (address: string, headers: Record<string, string> = { "x-forwarded-for": "7.7.7.7" }) =>
      GET(new Request(`http://localhost/api/scan?address=${address}`, { headers }));
  }

  afterEach(() => vi.unstubAllEnvs());

  it("spoofed left-most XFF does not bypass the limiter", async () => {
    vi.resetModules();
    const { GET } = await import("@/app/api/scan/route");
    let last: Response | undefined;
    for (let i = 0; i < 11; i++) {
      last = await GET(
        new Request("http://localhost/api/scan?address=bad", {
          headers: { "x-forwarded-for": `6.6.6.${i}, 8.8.8.8` },
        }),
      );
    }
    expect(last?.status).toBe(429);
  });

  it("returns 503 at the concurrency cap and releases the slot after completion", async () => {
    const scan = await load({ SCAN_MAX_CONCURRENT: "1" });
    const first = await scan(A);
    expect(first.status).toBe(200);
    const busy = await scan(B);
    expect(busy.status).toBe(503);
    expect(busy.headers.get("retry-after")).toBe("5");
    expect(await busy.json()).toEqual({ error: "Busy — try again in a few seconds." });
    await first.text();
    const second = await scan(B);
    expect(second.status).toBe(200);
    await second.text();
  });

  it("releases the slot when the client cancels the stream", async () => {
    const scan = await load({ SCAN_MAX_CONCURRENT: "1" });
    const first = await scan(A);
    await first.body?.cancel();
    const next = await scan(B);
    expect(next.status).toBe(200);
    await next.text();
  });

  it("replays a completed scan from cache without a slot, still rate-limited", async () => {
    const scan = await load({ SCAN_MAX_CONCURRENT: "1" });
    const fresh = await (await scan(A)).text();
    expect(fresh.trim().split("\n").at(-1)).toContain("scan_done");

    const hold = await scan(B); // occupies the only slot
    expect(hold.status).toBe(200);
    const hit = await scan(A.toUpperCase().replace("0X", "0x"));
    expect(hit.status).toBe(200);
    expect(hit.headers.get("x-scan-cache")).toBe("hit");
    expect(await hit.text()).toBe(fresh);
    await hold.text();

    // 3 used so far for this IP; 7 more allowed, then 429 even for cached replays.
    for (let i = 0; i < 7; i++) expect((await scan(A)).status).toBe(200);
    expect((await scan(A)).status).toBe(429);
  });

  it("prefers the Vercel header when running on Vercel", () => {
    const h = new Headers({
      "x-vercel-forwarded-for": "4.4.4.4",
      "x-real-ip": "3.3.3.3",
      "x-forwarded-for": "1.1.1.1, 2.2.2.2",
    });
    expect(clientIp(h, true)).toBe("4.4.4.4");
    expect(clientIp(new Headers({ "x-real-ip": "3.3.3.3" }), true)).toBe("3.3.3.3");
    expect(clientIp(h, false)).toBe("2.2.2.2");
  });
});

describe("scanReducer", () => {
  const empty: ScanState = {
    phase: "connecting",
    adapters: [],
    positions: [],
    summary: summarize([]),
    log: [],
  };

  it("tracks adapter progress and failures", () => {
    let s = scanReducer(empty, {
      type: "event",
      event: {
        type: "scan_started",
        address: "0x1111111111111111111111111111111111111111",
        adapterIds: ["a", "b"],
        adapters: [
          { id: "a", name: "A", category: "bridge" },
          { id: "b", name: "B", category: "airdrop" },
        ],
      },
    });
    expect(s.phase).toBe("scanning");
    s = scanReducer(s, {
      type: "event",
      event: { type: "adapter_failed", adapterId: "b", error: "x", timedOut: true, ms: 5 },
    });
    expect(s.adapters.find((a) => a.id === "b")?.status).toBe("failed");
    expect(s.adapters.find((a) => a.id === "a")?.status).toBe("scanning");
    expect(s.log.at(-1)).toContain("timed out");
  });
});
