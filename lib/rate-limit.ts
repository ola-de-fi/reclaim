/**
 * Fixed-window rate limiter kept in memory.
 * Good enough for one server instance; swap for a shared store (e.g. Upstash) before scaling out.
 */
export function createRateLimiter({ limit, windowMs }: { limit: number; windowMs: number }) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return function check(key: string, now = Date.now()) {
    // Drop expired entries now and then so the map can't grow forever.
    if (hits.size > 10_000) {
      for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    }
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count++;
    return {
      ok: entry.count <= limit,
      remaining: Math.max(0, limit - entry.count),
      retryAfterSec: Math.ceil((entry.resetAt - now) / 1000),
    };
  };
}

export function clientIp(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}
