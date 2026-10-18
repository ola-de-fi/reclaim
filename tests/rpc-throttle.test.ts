import { describe, expect, it } from "vitest";
import {
  createThrottledFetch,
  HostLimiter,
  isRateLimitBody,
  parseRetryAfter,
  type FetchLike,
} from "@/lib/scanner/rpc-throttle";

const URL_A = "https://rpc.example.com/";

/** Fake clock: sleep resolves immediately and records requested waits; time moves via advance(). */
function fakeTime() {
  let t = 0;
  const sleeps: number[] = [];
  return {
    now: () => t,
    advance: (ms: number) => void (t += ms),
    sleeps,
    sleep: async (ms: number, signal?: AbortSignal) => {
      if (signal?.aborted) throw new Error("aborted");
      sleeps.push(ms);
      await Promise.resolve();
    },
  };
}

const ok = () => new Response('{"jsonrpc":"2.0","id":1,"result":"0x1"}', { status: 200 });
const tooMany = (headers?: Record<string, string>) =>
  new Response("Too Many Requests", { status: 429, headers });

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

describe("rpc throttle", () => {
  it("caps concurrent in-flight requests per host", async () => {
    const time = fakeTime();
    let inFlight = 0;
    let peak = 0;
    const base: FetchLike = async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return ok();
    };
    const f = createThrottledFetch(base, () => 3, { ...time, minSpacingMs: 0 });
    await Promise.all(Array.from({ length: 12 }, () => f(URL_A)));
    expect(peak).toBe(3);
  });

  it("spaces request starts", async () => {
    const time = fakeTime();
    const f = createThrottledFetch(
      async () => ok(),
      () => 10,
      { ...time, minSpacingMs: 100 },
    );
    await Promise.all(Array.from({ length: 4 }, () => f(URL_A)));
    // Starts are reserved at 0, 100, 200, 300: each waits its offset from "now" (0).
    expect(time.sleeps).toEqual([100, 200, 300]);
    // A later request after a gap starts immediately.
    time.advance(1000);
    time.sleeps.length = 0;
    await f(URL_A);
    expect(time.sleeps).toEqual([]);
  });

  it("retries 429 with jittered exponential backoff then succeeds", async () => {
    const time = fakeTime();
    let calls = 0;
    const base: FetchLike = async () => (++calls <= 2 ? tooMany() : ok());
    const f = createThrottledFetch(base, () => 3, {
      ...time,
      minSpacingMs: 0,
      random: () => 1,
      baseBackoffMs: 400,
      maxBackoffMs: 4000,
    });
    const res = await f(URL_A);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ result: "0x1" });
    expect(calls).toBe(3);
    expect(time.sleeps).toEqual([400, 800]);
  });

  it("treats a JSON-RPC rate-limit error as retryable", async () => {
    const time = fakeTime();
    let calls = 0;
    const base: FetchLike = async () =>
      ++calls === 1
        ? new Response(
            '{"jsonrpc":"2.0","id":1,"error":{"code":-32005,"message":"rate limit exceeded"}}',
          )
        : ok();
    const f = createThrottledFetch(base, () => 3, { ...time, minSpacingMs: 0 });
    expect((await f(URL_A)).status).toBe(200);
    expect(calls).toBe(2);
  });

  it("gives up after maxAttempts and returns the 429", async () => {
    const time = fakeTime();
    let calls = 0;
    const base: FetchLike = async () => (calls++, tooMany());
    const f = createThrottledFetch(base, () => 3, { ...time, minSpacingMs: 0, maxAttempts: 5 });
    expect((await f(URL_A)).status).toBe(429);
    expect(calls).toBe(5);
  });

  it("honors Retry-After", async () => {
    const time = fakeTime();
    let calls = 0;
    const base: FetchLike = async () => (++calls === 1 ? tooMany({ "retry-after": "2" }) : ok());
    const f = createThrottledFetch(base, () => 3, { ...time, minSpacingMs: 0, random: () => 0 });
    await f(URL_A);
    expect(time.sleeps).toEqual([2000]);
  });

  it("halves concurrency on 429 and recovers after successes", async () => {
    const time = fakeTime();
    let fail = true;
    const base: FetchLike = async () => (fail ? ((fail = false), tooMany()) : ok());
    const f = createThrottledFetch(base, () => 4, {
      ...time,
      minSpacingMs: 0,
      recoverAfter: 2,
    });
    await f(URL_A);
    const l = f.limiter("rpc.example.com");
    expect(l.limit).toBe(2); // halved from 4; the retry's success is 1 of 2
    await f(URL_A);
    expect(l.limit).toBe(3);
    await f(URL_A);
    await f(URL_A);
    expect(l.limit).toBe(4);
    await f(URL_A);
    await f(URL_A);
    expect(l.limit).toBe(4); // never exceeds the configured cap
  });

  it("releases the slot when a request is aborted (in flight or queued)", async () => {
    const time = fakeTime();
    const gate = deferred();
    const base: FetchLike = (_input, init) =>
      new Promise((resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        void gate.promise.then(() => resolve(ok()));
      });
    const f = createThrottledFetch(base, () => 1, { ...time, minSpacingMs: 0 });
    const l = f.limiter("rpc.example.com");

    const c1 = new AbortController();
    const c2 = new AbortController();
    const p1 = f(URL_A, { signal: c1.signal });
    const p2 = f(URL_A, { signal: c2.signal }); // queued behind p1
    await Promise.resolve();
    expect(l.inFlight).toBe(1);
    c2.abort();
    await expect(p2).rejects.toBeDefined();
    c1.abort();
    await expect(p1).rejects.toThrow("aborted");
    expect(l.inFlight).toBe(0);

    const p3 = f(URL_A);
    gate.resolve();
    expect((await p3).status).toBe(200);
    expect(l.inFlight).toBe(0);
  });

  it("limiter wakes waiters only up to the limit", async () => {
    const time = fakeTime();
    const l = new HostLimiter({
      maxConcurrency: 2,
      minSpacingMs: 0,
      maxAttempts: 1,
      baseBackoffMs: 1,
      maxBackoffMs: 1,
      recoverAfter: 1,
      random: () => 0,
      ...time,
    });
    await l.acquire();
    await l.acquire();
    let third = false;
    void l.acquire().then(() => (third = true));
    await Promise.resolve();
    expect(third).toBe(false);
    l.release();
    await new Promise((r) => setTimeout(r, 0));
    expect(third).toBe(true);
    expect(l.inFlight).toBe(2);
  });

  it("parses Retry-After and rate-limit bodies", () => {
    expect(parseRetryAfter("3", 0)).toBe(3000);
    expect(parseRetryAfter(null, 0)).toBeUndefined();
    expect(parseRetryAfter(new Date(5000).toUTCString(), 0)).toBe(5000);
    expect(isRateLimitBody('{"error":{"code":-32005,"message":"Too Many Requests"}}')).toBe(true);
    expect(isRateLimitBody('[{"result":"0x1"},{"error":{"code":429,"message":"x"}}]')).toBe(true);
    expect(isRateLimitBody('{"error":{"code":3,"message":"execution reverted"}}')).toBe(false);
    expect(isRateLimitBody('{"result":"0x429"}')).toBe(false);
  });
});
