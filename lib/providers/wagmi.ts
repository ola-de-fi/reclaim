import { http, createConfig } from "wagmi";
import { ALL_CHAINS, toViemChain } from "@/config/chains";

/**
 * Read-only wagmi config for the browser (public RPCs only; private RPCs stay server-side).
 * Not mounted yet. Wallet connection (RainbowKit) arrives in Phase 4.
 */
export function createReadOnlyWagmiConfig() {
  const [first, ...rest] = ALL_CHAINS.map(toViemChain);
  if (!first) throw new Error("No chains configured");
  const chains = [first, ...rest] as const;
  return createConfig({
    chains,
    transports: Object.fromEntries(chains.map((c) => [c.id, http()])),
    ssr: true,
  });
}
