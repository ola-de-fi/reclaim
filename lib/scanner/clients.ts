import "server-only";
import { createPublicClient, http, type PublicClient } from "viem";
import { getChainById, getRpcUrl, toViemChain } from "@/config/chains";

/**
 * Server-side viem clients, one per chain, using private RPC overrides when configured.
 * Server-only so RPC keys in env never reach the browser bundle.
 */
export function createClientFactory(env: Record<string, string | undefined> = process.env) {
  const cache = new Map<number, PublicClient>();
  return (chainId: number): PublicClient => {
    const cached = cache.get(chainId);
    if (cached) return cached;
    const chain = getChainById(chainId);
    if (!chain) throw new Error(`Unknown chain ${chainId}`);
    const client = createPublicClient({
      chain: toViemChain(chain),
      transport: http(getRpcUrl(chain, env), { batch: true, retryCount: 2, timeout: 10_000 }),
    }) as PublicClient;
    cache.set(chainId, client);
    return client;
  };
}
