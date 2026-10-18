/**
 * Per-RPC-host request throttle with 429-aware backoff, applied at the fetch level so every viem
 * call benefits. Pure logic: clock, sleep and randomness are injectable for tests.
 *
 * - Caps concurrent in-flight requests per host and spaces request starts (smooths bursts).
 * - On HTTP 429 (or a JSON-RPC "rate limit" error) it retries the same request with exponential
 *   backoff + full jitter, honoring Retry-After, and halves the host's concurrency (AIMD);
 *   the limit recovers by +1 after a run of successes.
 */

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface ThrottleOptions {
  /** Upper bound on concurrent in-flight requests per host. */
  maxConcurrency: number;
  /** Minimum gap between request starts per host, in ms. */
  minSpacingMs: number;
  /** Total attempts for one request when rate-limited (1 = no retry). */
  maxAttempts: number;
  baseBackoffMs: number;
  maxBackoffMs: number;
  /** Consecutive successes before the reduced concurrency limit grows by one. */
  recoverAfter: number;
  now: () => number;
  sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  random: () => number;
}

export const DEFAULT_THROTTLE: Omit<ThrottleOptions, "maxConcurrency"> = {
  minSpacingMs: 80,
  maxAttempts: 5,
  baseBackoffMs: 400,
  maxBackoffMs: 4_000,
  recoverAfter: 8,
  now: () => Date.now(),
  sleep: abortableSleep,
  random: Math.random,
};

export function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError(signal));
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(abortError(signal!));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function abortError(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("The operation was aborted.", "AbortError");
}

/** Concurrency + spacing gate for one host. */
export class HostLimiter {
  inFlight = 0;
  limit: number;
  private lastStart = -Infinity;
  private successes = 0;
  private waiters: Array<() => void> = [];

  constructor(private readonly opts: ThrottleOptions) {
    this.limit = Math.max(1, opts.maxConcurrency);
  }

  /** Resolves once a slot is held; caller must call release() exactly once afterwards. */
  async acquire(signal?: AbortSignal): Promise<void> {
    while (this.inFlight >= this.limit) {
      if (signal?.aborted) throw abortError(signal);
      await new Promise<void>((resolve, reject) => {
        const wake = () => {
          signal?.removeEventListener("abort", onAbort);
          resolve();
        };
        const onAbort = () => {
          this.waiters = this.waiters.filter((w) => w !== wake);
          reject(abortError(signal!));
        };
        this.waiters.push(wake);
        signal?.addEventListener("abort", onAbort, { once: true });
      });
    }
    // Reserve the slot and a start time synchronously, then wait out the spacing.
    this.inFlight++;
    const now = this.opts.now();
    const start = Math.max(now, this.lastStart + this.opts.minSpacingMs);
    this.lastStart = start;
    if (start > now) {
      try {
        await this.opts.sleep(start - now, signal);
      } catch (err) {
        this.release();
        throw err;
      }
    }
  }

  release(): void {
    this.inFlight = Math.max(0, this.inFlight - 1);
    this.wakeAvailable();
  }

  onRateLimited(): void {
    this.limit = Math.max(1, Math.floor(this.limit / 2));
    this.successes = 0;
  }

  onSuccess(): void {
    if (this.limit >= this.opts.maxConcurrency) return;
    if (++this.successes >= this.opts.recoverAfter) {
      this.limit++;
      this.successes = 0;
      this.wakeAvailable();
    }
  }

  private wakeAvailable(): void {
    let free = this.limit - this.inFlight;
    while (free-- > 0 && this.waiters.length) this.waiters.shift()!();
  }
}

/** Parses Retry-After (seconds or HTTP date) into ms, or undefined. */
export function parseRetryAfter(value: string | null, now: number): number | undefined {
  if (!value) return undefined;
  const secs = Number(value);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}

const RATE_LIMIT_RE = /rate limit|too many requests|429/i;

/** True when a JSON-RPC body (single or batch) reports a rate-limit error. */
export function isRateLimitBody(text: string): boolean {
  if (!RATE_LIMIT_RE.test(text)) return false;
  try {
    const parsed = JSON.parse(text) as unknown;
    const items = Array.isArray(parsed) ? parsed : [parsed];
    return items.some((item) => {
      const err = (item as { error?: { code?: number; message?: string } } | null)?.error;
      return !!err && (err.code === 429 || RATE_LIMIT_RE.test(err.message ?? ""));
    });
  } catch {
    return false;
  }
}

function hostOf(input: string | URL | Request): string {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * Wraps a fetch with per-host throttling and rate-limit retries. `concurrencyFor(host)` sets the
 * cap per host; limiters live as long as the returned function (share it process-wide).
 */
export function createThrottledFetch(
  baseFetch: FetchLike,
  concurrencyFor: (host: string) => number,
  overrides: Partial<Omit<ThrottleOptions, "maxConcurrency">> = {},
): FetchLike & { limiter: (host: string) => HostLimiter } {
  const base = { ...DEFAULT_THROTTLE, ...overrides };
  const limiters = new Map<string, HostLimiter>();
  const limiter = (host: string) => {
    let l = limiters.get(host);
    if (!l) {
      l = new HostLimiter({ ...base, maxConcurrency: concurrencyFor(host) });
      limiters.set(host, l);
    }
    return l;
  };

  const throttled = async (input: string | URL | Request, init?: RequestInit) => {
    const l = limiter(hostOf(input));
    const signal = init?.signal ?? undefined;
    for (let attempt = 1; ; attempt++) {
      await l.acquire(signal);
      let res: Response;
      let body: string | undefined;
      try {
        res = await baseFetch(input, init);
        if (res.status !== 429 && res.ok) body = await res.text();
      } finally {
        l.release();
      }
      const limited = res.status === 429 || (body !== undefined && isRateLimitBody(body));
      if (!limited) {
        if (res.ok) l.onSuccess();
        return body === undefined
          ? res
          : new Response(body, {
              status: res.status,
              statusText: res.statusText,
              headers: res.headers,
            });
      }
      l.onRateLimited();
      if (attempt >= base.maxAttempts) {
        return body === undefined
          ? res
          : new Response(body, {
              status: res.status,
              statusText: res.statusText,
              headers: res.headers,
            });
      }
      // Drain the unused 429 body so the connection is reusable.
      if (body === undefined) await res.text().catch(() => undefined);
      const cap = Math.min(base.maxBackoffMs, base.baseBackoffMs * 2 ** (attempt - 1));
      const jittered = base.random() * cap;
      const retryAfter = parseRetryAfter(res.headers.get("retry-after"), base.now());
      const wait =
        retryAfter !== undefined ? Math.min(Math.max(retryAfter, jittered), 10_000) : jittered;
      await base.sleep(wait, signal);
    }
  };
  return Object.assign(throttled, { limiter });
}
