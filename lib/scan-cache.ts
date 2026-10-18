/** Tiny bounded TTL cache for completed scan event lists, keyed by checksummed address. */
export function createScanCache<T>({ ttlMs = 60_000, maxEntries = 500 } = {}) {
  const entries = new Map<string, { events: T[]; expiresAt: number }>();
  return {
    get(key: string, now = Date.now()): T[] | undefined {
      const e = entries.get(key);
      if (!e) return undefined;
      if (e.expiresAt <= now) {
        entries.delete(key);
        return undefined;
      }
      return e.events;
    },
    set(key: string, events: T[], now = Date.now()) {
      entries.delete(key);
      for (const [k, v] of entries) if (v.expiresAt <= now) entries.delete(k);
      while (entries.size >= maxEntries) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        entries.delete(oldest);
      }
      entries.set(key, { events, expiresAt: now + ttlMs });
    },
    get size() {
      return entries.size;
    },
  };
}
