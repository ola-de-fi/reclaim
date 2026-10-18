import { describe, expect, it, vi } from "vitest";
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
    expect(clientIp(new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4");
    expect(clientIp(new Headers())).toBe("unknown");
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
