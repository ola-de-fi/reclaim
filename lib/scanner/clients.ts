import "server-only";
import { Agent, fetch as undiciFetch } from "undici";
import { createPublicClient, http, type PublicClient } from "viem";
import { CHAINS, getChainById, getRpcUrl, toViemChain } from "@/config/chains";
import { createThrottledFetch, type FetchLike } from "./rpc-throttle";

/**
 * HTTP/1.1 only. Node 26's fetch negotiates HTTP/2, and under many concurrent RPC calls its
 * HTTP/2 session can spin at 100% CPU (Http2Session::SendPendingData), freezing the server.
 */
const dispatcher = new Agent({ allowH2: false, connections: 16, keepAliveTimeout: 10_000 });

const undiciFetchLike: FetchLike = (input, init) =>
  // undici's own fetch + its Agent: a dispatcher from the undici package is not accepted by
  // every Node version's built-in fetch (Vercel Node 24 failed with "fetch failed").
  undiciFetch(input as string, { ...(init as object), dispatcher }) as unknown as Promise<Response>;

const PUBLIC_RPC_CONCURRENCY = 3;
const PRIVATE_RPC_CONCURRENCY = 12;

/**
 * Concurrency cap for an RPC host: RPC_MAX_CONCURRENCY if set, else 12 for hosts that come from a
 * private override env var and 3 for the public endpoints (which 429 shared datacenter IPs).
 */
export function concurrencyForHost(
  host: string,
  env: Record<string, string | undefined> = process.env,
): number {
  const explicit = Number(env.RPC_MAX_CONCURRENCY);
  if (Number.isFinite(explicit) && explicit >= 1) return Math.floor(explicit);
  for (const chain of Object.values(CHAINS)) {
    const override = env[chain.rpc.envVar]?.trim();
    if (override && safeHost(override) === host) return PRIVATE_RPC_CONCURRENCY;
  }
  return PUBLIC_RPC_CONCURRENCY;
}

function safeHost(url: string): string | undefined {
  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
}

/** Process-wide, so the per-host limits are shared across all concurrent scans. */
const throttledFetch = createThrottledFetch(undiciFetchLike, (host) => concurrencyForHost(host));

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
        // Rate-limit retries happen in throttledFetch; one viem retry covers other transient errors.
        retryCount: 1,
        timeout: 10_000,
        fetchFn: throttledFetch as unknown as typeof fetch,
      }),
    }) as PublicClient;
    cache.set(chainId, client);
    return client;
  };
}
