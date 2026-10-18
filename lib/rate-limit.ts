/**
 * Fixed-window rate limiter kept in memory.
 * Good enough for one server instance; swap for a shared store (e.g. Upstash) before scaling out.
 */
export function createRateLimiter({
  limit,
  windowMs,
  maxKeys = 10_000,
}: {
  limit: number;
  windowMs: number;
  maxKeys?: number;
}) {
  // Map preserves insertion order; a key is re-inserted when its window resets, so the first
  // entries are always the oldest windows.
  const hits = new Map<string, { count: number; resetAt: number }>();
  let lastPrune = 0;

  function prune(now: number) {
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    lastPrune = now;
  }

  return function check(key: string, now = Date.now()) {
    // Bounded, regular pruning: sweep expired entries at most once per window.
    if (now - lastPrune >= windowMs) prune(now);

    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      hits.delete(key);
      // Hard cap: evict the oldest windows first.
      while (hits.size >= maxKeys) {
        const oldest = hits.keys().next().value;
        if (oldest === undefined) break;
        hits.delete(oldest);
      }
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count++;
    return {
      ok: entry.count <= limit,
      remaining: Math.max(0, limit - entry.count),
      retryAfterSec: Math.ceil((entry.resetAt - now) / 1000),
      size: hits.size,
    };
  };
}

/**
 * Best-effort client IP for rate limiting.
 *
 * Assumption: the app is deployed on Vercel (or behind exactly one trusted reverse proxy).
 * - On Vercel, `x-vercel-forwarded-for` / `x-real-ip` are set by Vercel's edge and cannot be
 *   forged by the client, so they are preferred.
 * - Otherwise we take the RIGHT-most `x-forwarded-for` entry: the hop appended by the nearest
 *   proxy. Left-most entries are client-controlled and trivially spoofed.
 * If you add more trusted proxies in front, this must skip that many hops from the right.
 */
export function clientIp(headers: Headers, onVercel = Boolean(process.env.VERCEL)): string {
  if (onVercel) {
    const v =
      headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
      headers.get("x-real-ip")?.trim();
    if (v) return v;
  }
  const xff = headers
    .get("x-forwarded-for")
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return xff?.at(-1) || headers.get("x-real-ip")?.trim() || "unknown";
}

/** Caps concurrent work per server instance. `tryAcquire` returns an idempotent release fn. */
export function createConcurrencyGate(max: number) {
  let active = 0;
  return {
    tryAcquire(): (() => void) | null {
      if (active >= max) return null;
      active++;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        active--;
      };
    },
    get active() {
      return active;
    },
  };
}
