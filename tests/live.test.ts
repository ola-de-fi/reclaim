import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import type { Address } from "viem";

vi.mock("server-only", () => ({}));

/**
 * Hits the real Robinhood Chain and Ethereum RPCs. Skipped unless LIVE=1:
 *   LIVE=1 pnpm vitest run tests/live.test.ts
 */
const LIVE = process.env.LIVE === "1";
const WALLET = (process.env.LIVE_WALLET ?? "0x380c87712Bd7bF34F8645d5674aB065Ca249de79") as Address;

describe.skipIf(!LIVE)("live adapters", async () => {
  const { createClientFactory } = await import("@/lib/scanner/clients");
  const { getAdapters } = await import("@/lib/scanner");
  const getClient = createClientFactory();

  for (const adapter of getAdapters({})) {
    it(
      adapter.id,
      async () => {
        const started = Date.now();
        let lastTick = Date.now();
        let maxStall = 0;
        const ticker = setInterval(() => {
          maxStall = Math.max(maxStall, Date.now() - lastTick - 100);
          lastTick = Date.now();
        }, 100);
        try {
          const positions = await adapter.scanAddress(WALLET, {
            getClient,
            signal: new AbortController().signal,
            logger: { info() {}, warn: console.warn },
          });
          console.log(
            adapter.id,
            `${Date.now() - started}ms`,
            `max event-loop stall ${maxStall}ms`,
            positions.map((p) => `${p.kind} ${p.amountFormatted} ${p.asset.symbol}`),
          );
          expect(Array.isArray(positions)).toBe(true);
        } finally {
          clearInterval(ticker);
        }
      },
      120_000,
    );
  }
});
