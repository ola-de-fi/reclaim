import { parseAbi, type Address, type PublicClient } from "viem";
import { readMany } from "./multicall";

const feedAbi = parseAbi([
  "function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)",
]);

/** Feeds older than this are treated as unavailable (stablecoin heartbeats are 24h). */
const MAX_AGE_SECONDS = 48 * 3600;

/**
 * Reads Chainlink USD prices (8 decimals) from Ethereum. Returns a map feed → price,
 * leaving out feeds that failed, are stale, or report a non-positive answer.
 */
export async function readUsdPrices(
  l1: PublicClient,
  feeds: Address[],
  now = Date.now() / 1000,
): Promise<Map<string, number>> {
  const unique = [...new Set(feeds.map((f) => f.toLowerCase() as Address))];
  const results = await readMany(
    l1,
    unique.map((address) => ({ address, abi: feedAbi, functionName: "latestRoundData" })),
  );
  const prices = new Map<string, number>();
  unique.forEach((feed, i) => {
    const r = results[i];
    if (r?.status !== "success") return;
    const [, answer, , updatedAt] = r.result as readonly [bigint, bigint, bigint, bigint, bigint];
    if (answer <= 0n || now - Number(updatedAt) > MAX_AGE_SECONDS) return;
    prices.set(feed, Number(answer) / 1e8);
  });
  return prices;
}

export function priceOf(prices: Map<string, number>, feed: Address | null): number | null {
  return feed ? (prices.get(feed.toLowerCase()) ?? null) : null;
}
