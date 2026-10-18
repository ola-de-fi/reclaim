import { describe, expect, it } from "vitest";
import { createConcurrencyGate, createRateLimiter } from "@/lib/rate-limit";
import { createScanCache } from "@/lib/scan-cache";

describe("rate limiter pruning", () => {
  it("prunes expired keys once per window and hard-caps keys", () => {
    const check = createRateLimiter({ limit: 5, windowMs: 1000, maxKeys: 3 });
    check("a", 0);
    check("b", 0);
    check("c", 0);
    expect(check("d", 1).size).toBe(3); // "a" evicted
    expect(check("a", 2)).toMatchObject({ ok: true, remaining: 4 });
    expect(check("e", 2000).size).toBe(1); // everything expired and swept
  });
});

describe("concurrency gate", () => {
  it("caps and releases idempotently", () => {
    const g = createConcurrencyGate(1);
    const r = g.tryAcquire();
    expect(r).toBeTruthy();
    expect(g.tryAcquire()).toBeNull();
    r?.();
    r?.();
    expect(g.active).toBe(0);
  });
});

describe("scan cache", () => {
  it("expires entries and bounds size", () => {
    const c = createScanCache<number>({ ttlMs: 100, maxEntries: 2 });
    c.set("a", [1], 0);
    c.set("b", [2], 0);
    c.set("c", [3], 0);
    expect(c.get("a", 1)).toBeUndefined();
    expect(c.get("c", 1)).toEqual([3]);
    expect(c.get("c", 100)).toBeUndefined();
  });
});
