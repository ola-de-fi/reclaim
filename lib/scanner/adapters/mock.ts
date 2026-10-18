import { CHAINS } from "@/config/chains";
import type { ProtocolAdapter } from "../types";

/**
 * Fake data for building the UI before real adapters exist (Phase 3).
 * Only enabled when SCANNER_MOCK=1. Never registered in production.
 */
export const mockAdapter: ProtocolAdapter = {
  id: "mock",
  name: "Mock data",
  category: "bridge",
  supportedChainIds: [CHAINS.robinhood.id],
  async scanAddress(address) {
    await new Promise((r) => setTimeout(r, 400));
    const chainId = CHAINS.robinhood.id;
    const tag = address.slice(2, 8).toLowerCase();
    return [
      {
        id: `mock:${tag}:withdrawal`,
        adapterId: "mock",
        protocol: "Canonical bridge (mock)",
        chainId,
        kind: "pending",
        category: "bridge",
        asset: { symbol: "ETH", address: "native", decimals: 18 },
        amountRaw: "250000000000000000",
        amountFormatted: "0.25",
        estimatedUsdValue: 812.5,
        estimatedGasUsd: 4.1,
        readyAt: Math.floor(Date.now() / 1000) + 3 * 86_400,
        claimAction: { type: "none" },
        risk: { verified: false, notes: "Mock data" },
        source: CHAINS.robinhood.explorer.url,
      },
      {
        id: `mock:${tag}:airdrop`,
        adapterId: "mock",
        protocol: "Airdrop distributor (mock)",
        chainId,
        kind: "claimable",
        category: "airdrop",
        asset: {
          symbol: "MOCK",
          address: "0x0000000000000000000000000000000000000001",
          decimals: 18,
        },
        amountRaw: "1200000000000000000000",
        amountFormatted: "1,200",
        estimatedUsdValue: 96,
        claimAction: { type: "none" },
        risk: { verified: false, notes: "Mock data" },
        source: CHAINS.robinhood.explorer.url,
      },
    ];
  },
};
