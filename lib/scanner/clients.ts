import "server-only";
import { Agent } from "undici";
import { createPublicClient, http, type PublicClient } from "viem";
import { getChainById, getRpcUrl, toViemChain } from "@/config/chains";

/**
 * HTTP/1.1 only. Node 26's fetch negotiates HTTP/2, and under many concurrent RPC calls its
 * HTTP/2 session can spin at 100% CPU (Http2Session::SendPendingData), freezing the server.
 */
const dispatcher = new Agent({ allowH2: false, connections: 16, keepAliveTimeout: 10_000 });

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
      transport: http(getRpcUrl(chain, env), {
        retryCount: 2,
        timeout: 10_000,
        fetchOptions: { dispatcher } as RequestInit,
      }),
    }) as PublicClient;
    cache.set(chainId, client);
    return client;
  };
}
