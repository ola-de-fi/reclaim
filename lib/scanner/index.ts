import { CHAINS } from "@/config/chains";
import { createArbitrumOutboxAdapter } from "./adapters/arbitrum-outbox";
import { createRetryablesAdapter } from "./adapters/arbitrum-retryables";
import { createTokenBalancesAdapter } from "./adapters/robinhood-tokens";
import { mockAdapter } from "./adapters/mock";
import type { ProtocolAdapter } from "./types";

export * from "./types";
export { runScan, summarize, type ScanEvent, type ScanSummary, type ScanOptions } from "./engine";
export { readMany, withRetry, type ReadCall, type ReadResult } from "./multicall";

const realAdapters: ProtocolAdapter[] = [
  createArbitrumOutboxAdapter(CHAINS.robinhood),
  createRetryablesAdapter(CHAINS.robinhood),
  createTokenBalancesAdapter(CHAINS.robinhood),
];

/** Registered adapters. SCANNER_MOCK=1 swaps in fake data for UI work (never in production). */
export function getAdapters(
  env: Record<string, string | undefined> = process.env,
): ProtocolAdapter[] {
  if (env.SCANNER_MOCK === "1" && env.NODE_ENV !== "production") return [mockAdapter];
  return realAdapters;
}
