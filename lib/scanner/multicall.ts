import type { Abi, ContractFunctionParameters, PublicClient } from "viem";

export type ReadCall = ContractFunctionParameters<Abi, "pure" | "view">;

export type ReadResult =
  { status: "success"; result: unknown } | { status: "failure"; error: Error };

export interface MulticallOptions {
  /** Calls per multicall request. */
  chunkSize?: number;
  /** Multicall requests in flight at once. */
  chunkConcurrency?: number;
  /** Parallel eth_calls when the chain has no verified Multicall3. */
  fallbackConcurrency?: number;
  retries?: number;
}

/** Narrow client surface so tests can pass a stub. */
type ReadClient = Pick<PublicClient, "multicall" | "readContract"> & {
  chain?: PublicClient["chain"];
};

/**
 * Batched contract reads that never throw per-call: each result is success or failure.
 * Uses Multicall3 when the chain has a verified deployment, otherwise falls back to
 * individual eth_calls with a concurrency cap so we don't trip public RPC rate limits.
 */
export async function readMany(
  client: ReadClient,
  calls: ReadCall[],
  options: MulticallOptions = {},
): Promise<ReadResult[]> {
  const { chunkSize = 200, chunkConcurrency = 4, fallbackConcurrency = 6, retries = 2 } = options;
  if (calls.length === 0) return [];

  if (client.chain?.contracts?.multicall3) {
    const chunks: ReadCall[][] = [];
    for (let i = 0; i < calls.length; i += chunkSize) chunks.push(calls.slice(i, i + chunkSize));
    const results: ReadResult[][] = new Array(chunks.length);
    let nextChunk = 0;
    const chunkWorker = async () => {
      while (nextChunk < chunks.length) {
        const i = nextChunk++;
        const res = await withRetry(
          () => client.multicall({ contracts: chunks[i]!, allowFailure: true }),
          retries,
        );
        results[i] = res.map((r) =>
          r.status === "success"
            ? { status: "success", result: r.result }
            : { status: "failure", error: r.error },
        );
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(chunkConcurrency, chunks.length) }, chunkWorker),
    );
    return results.flat();
  }

  const out: ReadResult[] = new Array(calls.length);
  let next = 0;
  const worker = async () => {
    while (next < calls.length) {
      const i = next++;
      try {
        const result = await withRetry(() => client.readContract(calls[i]!), retries);
        out[i] = { status: "success", result };
      } catch (err) {
        out[i] = { status: "failure", error: err instanceof Error ? err : new Error(String(err)) };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(fallbackConcurrency, calls.length) }, worker));
  return out;
}

/** Retries rate-limit and transient network errors with exponential backoff and full jitter. */
export async function withRetry<T>(
  fn: () => Promise<T>,
  retries: number,
  baseMs = 400,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= retries || !isRetryable(err)) throw err;
      // Full jitter: spreads retries from parallel workers instead of re-bursting in lockstep.
      await new Promise((r) => setTimeout(r, Math.random() * baseMs * 2 ** attempt));
    }
  }
}

function isRetryable(err: unknown): boolean {
  const e = err as { status?: number; message?: string } | null;
  if (e?.status === 429 || (e?.status ?? 0) >= 500) return true;
  return /429|rate limit|too many requests|timeout|timed out|ECONNRESET|fetch failed/i.test(
    e?.message ?? "",
  );
}
