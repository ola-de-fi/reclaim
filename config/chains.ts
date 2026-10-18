import { defineChain, type Address, type Chain } from "viem";
import { arbitrum, base, mainnet, optimism } from "viem/chains";

/**
 * A value we either have checked against an official source, or have not.
 * Unverified values are always null so nothing downstream can use a guess.
 */
export type Verifiable<T> =
  | { status: "verified"; value: T; source: string }
  | { status: "unverified"; value: null; note?: string };

const unverified = (note?: string): { status: "unverified"; value: null; note?: string } => ({
  status: "unverified",
  value: null,
  note,
});

export type ChainKey =
  "robinhood" | "robinhoodTestnet" | "ethereum" | "arbitrum" | "base" | "optimism";

/** primary = the chain Reclaim is built around; secondary = scanned for cross-chain context. */
export type ChainRole = "primary" | "secondary" | "testnet";

/** recovery = claim flows may be built for it later; read-only = scanning only. */
export type ChainMode = "recovery" | "read-only";

export type BridgeIntegration = "relay" | "across" | "layerzero" | "ccip" | "lifi" | "0x";

export interface ChainConfig {
  key: ChainKey;
  id: number;
  name: string;
  role: ChainRole;
  mode: ChainMode;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  rpc: { publicUrl: string; envVar: string };
  explorer: { name: string; url: string };
  docsUrl?: string;
  /** Chain this one settles to, for L2s. */
  settlesTo?: ChainKey;
  contracts: {
    multicall3: Verifiable<Address>;
    usdc: Verifiable<Address>;
    canonicalBridge: {
      inbox: Verifiable<Address>;
      outbox: Verifiable<Address>;
      rollup: Verifiable<Address>;
    };
    dexRouters: Verifiable<Record<string, Address>>;
  };
  /** Third-party bridges listed by the chain's docs. Routes/assets still need checking per integration. */
  bridgeIntegrations: Record<BridgeIntegration, Verifiable<{ apiUrl?: string }>>;
}

const ROBINHOOD_DOCS = "https://docs.robinhood.com/chain/";

const unverifiedContracts = (): ChainConfig["contracts"] => ({
  multicall3: unverified(),
  usdc: unverified(),
  canonicalBridge: { inbox: unverified(), outbox: unverified(), rollup: unverified() },
  dexRouters: unverified(),
});

const unverifiedIntegrations = (note?: string): ChainConfig["bridgeIntegrations"] => ({
  relay: unverified(note),
  across: unverified(note),
  layerzero: unverified(note),
  ccip: unverified(note),
  lifi: unverified(note),
  "0x": unverified(note),
});

const ROBINHOOD_INTEGRATION_NOTE =
  "Listed in Robinhood bridging docs; supported routes and assets not yet verified.";

export const CHAINS: Record<ChainKey, ChainConfig> = {
  robinhood: {
    key: "robinhood",
    id: 4663,
    name: "Robinhood Chain",
    role: "primary",
    mode: "recovery",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpc: {
      publicUrl: "https://rpc.mainnet.chain.robinhood.com",
      envVar: "RPC_URL_ROBINHOOD_MAINNET",
    },
    explorer: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" },
    docsUrl: ROBINHOOD_DOCS,
    settlesTo: "ethereum",
    contracts: {
      ...unverifiedContracts(),
      multicall3: {
        status: "verified",
        value: "0xcA11bde05977b3631167028862bE2a173976CA11",
        source:
          "Runtime bytecode keccak 0xd5c15df6… identical to Ethereum Multicall3 (checked 2026-10-18)",
      },
    },
    bridgeIntegrations: unverifiedIntegrations(ROBINHOOD_INTEGRATION_NOTE),
  },
  robinhoodTestnet: {
    key: "robinhoodTestnet",
    id: 46630,
    name: "Robinhood Chain Testnet",
    role: "testnet",
    mode: "read-only",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpc: {
      publicUrl: "https://rpc.testnet.chain.robinhood.com",
      envVar: "RPC_URL_ROBINHOOD_TESTNET",
    },
    explorer: { name: "Explorer", url: "https://explorer.testnet.chain.robinhood.com" },
    docsUrl: ROBINHOOD_DOCS,
    contracts: unverifiedContracts(),
    bridgeIntegrations: unverifiedIntegrations(),
  },
  ethereum: fromViem("ethereum", mainnet, "RPC_URL_ETHEREUM"),
  arbitrum: fromViem("arbitrum", arbitrum, "RPC_URL_ARBITRUM", "ethereum"),
  base: fromViem("base", base, "RPC_URL_BASE", "ethereum"),
  optimism: fromViem("optimism", optimism, "RPC_URL_OPTIMISM", "ethereum"),
};

/** Secondary chains reuse viem's maintained chain definitions. */
function fromViem(key: ChainKey, chain: Chain, envVar: string, settlesTo?: ChainKey): ChainConfig {
  const multicall = chain.contracts?.multicall3?.address;
  const explorer = chain.blockExplorers?.default;
  return {
    key,
    id: chain.id,
    name: chain.name,
    role: "secondary",
    mode: "read-only",
    nativeCurrency: chain.nativeCurrency,
    rpc: { publicUrl: chain.rpcUrls.default.http[0] ?? "", envVar },
    explorer: { name: explorer?.name ?? "Explorer", url: explorer?.url ?? "" },
    settlesTo,
    contracts: {
      ...unverifiedContracts(),
      multicall3: multicall
        ? { status: "verified", value: multicall, source: "viem/chains (mds1/multicall)" }
        : unverified(),
    },
    bridgeIntegrations: unverifiedIntegrations(),
  };
}

export const PRIMARY_CHAIN = CHAINS.robinhood;

export const ALL_CHAINS: ChainConfig[] = Object.values(CHAINS);

export function getChainById(id: number): ChainConfig | undefined {
  return ALL_CHAINS.find((c) => c.id === id);
}

/** Server-side RPC URL: private override from env if set, otherwise the public endpoint. */
export function getRpcUrl(
  chain: ChainConfig,
  env: Record<string, string | undefined> = process.env,
): string {
  const override = env[chain.rpc.envVar]?.trim();
  return override || chain.rpc.publicUrl;
}

/** viem Chain object, e.g. for createPublicClient / wagmi. Multicall3 is only attached when verified. */
export function toViemChain(chain: ChainConfig): Chain {
  const multicall = chain.contracts.multicall3;
  return defineChain({
    id: chain.id,
    name: chain.name,
    nativeCurrency: chain.nativeCurrency,
    rpcUrls: { default: { http: [chain.rpc.publicUrl] } },
    blockExplorers: { default: { name: chain.explorer.name, url: chain.explorer.url } },
    contracts:
      multicall.status === "verified" ? { multicall3: { address: multicall.value } } : undefined,
    testnet: chain.role === "testnet",
  });
}
