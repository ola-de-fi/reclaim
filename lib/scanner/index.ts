import { mockAdapter } from "./adapters/mock";
import type { ProtocolAdapter } from "./types";

export * from "./types";
export { runScan, summarize, type ScanEvent, type ScanSummary, type ScanOptions } from "./engine";
export { readMany, withRetry, type ReadCall, type ReadResult } from "./multicall";

/** Registered adapters. Real ones get added here in Phase 3. */
export function getAdapters(
  env: Record<string, string | undefined> = process.env,
): ProtocolAdapter[] {
  const adapters: ProtocolAdapter[] = [];
  if (env.SCANNER_MOCK === "1" && env.NODE_ENV !== "production") adapters.push(mockAdapter);
  return adapters;
}
