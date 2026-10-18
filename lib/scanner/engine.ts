import type { Address } from "viem";
import { positionSchema } from "./schema";
import type { ClaimablePosition, PositionCategory, ProtocolAdapter, ScanContext } from "./types";

export type ScanEvent =
  | {
      type: "scan_started";
      address: Address;
      adapterIds: string[];
      adapters: Array<{ id: string; name: string; category: PositionCategory }>;
    }
  | { type: "adapter_started"; adapterId: string }
  | {
      type: "adapter_done";
      adapterId: string;
      positions: ClaimablePosition[];
      ms: number;
      dropped: number;
    }
  | { type: "adapter_failed"; adapterId: string; error: string; timedOut: boolean; ms: number }
  | { type: "scan_done"; summary: ScanSummary; ms: number };

export interface ScanSummary {
  /** Claimable right now. The headline number. */
  claimableUsd: number;
  /** Becomes claimable later (e.g. withdrawal in its challenge period). */
  pendingUsd: number;
  /** Already in the wallet. Shown, but never counted as "recovered". */
  walletAssetUsd: number;
  /** Claimable + pending, by category. */
  byCategory: Partial<Record<PositionCategory, number>>;
  positionCount: number;
  /** Positions whose USD value is unknown (no price). Excluded from totals. */
  unpricedCount: number;
  adaptersOk: number;
  adaptersFailed: number;
}

export interface ScanOptions {
  /** Per-adapter time budget. */
  timeoutMs?: number;
  /** Only run adapters that support at least one of these chains. Defaults to all. */
  chainIds?: number[];
  /** Cancels the whole scan. */
  signal?: AbortSignal;
}

export type ContextFactory = (signal: AbortSignal) => ScanContext;

const DEFAULT_TIMEOUT_MS = 8_000;

class AdapterTimeoutError extends Error {}

/**
 * Runs every applicable adapter in parallel and yields events as each one finishes,
 * so results can be streamed to the UI. One adapter failing or hanging never affects the others.
 */
export async function* runScan(
  address: Address,
  adapters: ProtocolAdapter[],
  createContext: ContextFactory,
  options: ScanOptions = {},
): AsyncGenerator<ScanEvent> {
  const started = Date.now();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const selected = options.chainIds
    ? adapters.filter((a) => a.supportedChainIds.some((id) => options.chainIds!.includes(id)))
    : adapters;

  yield {
    type: "scan_started",
    address,
    adapterIds: selected.map((a) => a.id),
    adapters: selected.map(({ id, name, category }) => ({ id, name, category })),
  };

  // Small queue so finished adapters are yielded in completion order.
  const queue: ScanEvent[] = [];
  let wake: (() => void) | null = null;
  const push = (e: ScanEvent) => {
    queue.push(e);
    wake?.();
  };

  const results: ScanEvent[] = [];
  let pending = selected.length;

  for (const adapter of selected) {
    push({ type: "adapter_started", adapterId: adapter.id });
    void runAdapter(address, adapter, createContext, timeoutMs, options.signal).then((e) => {
      results.push(e);
      pending--;
      push(e);
    });
  }

  while (pending > 0 || queue.length > 0) {
    if (queue.length === 0) await new Promise<void>((r) => (wake = r));
    wake = null;
    while (queue.length > 0) yield queue.shift()!;
  }

  yield { type: "scan_done", summary: summarize(results), ms: Date.now() - started };
}

async function runAdapter(
  address: Address,
  adapter: ProtocolAdapter,
  createContext: ContextFactory,
  timeoutMs: number,
  parent?: AbortSignal,
): Promise<ScanEvent> {
  const started = Date.now();
  const controller = new AbortController();
  const onParentAbort = () => controller.abort(parent?.reason);
  parent?.addEventListener("abort", onParentAbort, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    if (parent?.aborted) throw new Error("Scan aborted");
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new AdapterTimeoutError(`Timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });
    const raw = await Promise.race([
      adapter.scanAddress(address, createContext(controller.signal)),
      timeout,
    ]);

    const positions: ClaimablePosition[] = [];
    let dropped = 0;
    for (const item of Array.isArray(raw) ? raw : []) {
      const parsed = positionSchema.safeParse(item);
      // An adapter may only report positions under its own id.
      if (parsed.success && parsed.data.adapterId === adapter.id) {
        positions.push(parsed.data as ClaimablePosition);
      } else {
        dropped++;
      }
    }
    return {
      type: "adapter_done",
      adapterId: adapter.id,
      positions,
      dropped,
      ms: Date.now() - started,
    };
  } catch (err) {
    return {
      type: "adapter_failed",
      adapterId: adapter.id,
      error: err instanceof Error ? err.message : String(err),
      timedOut: err instanceof AdapterTimeoutError,
      ms: Date.now() - started,
    };
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener("abort", onParentAbort);
  }
}

export function summarize(events: ScanEvent[]): ScanSummary {
  const summary: ScanSummary = {
    claimableUsd: 0,
    pendingUsd: 0,
    walletAssetUsd: 0,
    byCategory: {},
    positionCount: 0,
    unpricedCount: 0,
    adaptersOk: 0,
    adaptersFailed: 0,
  };

  for (const e of events) {
    if (e.type === "adapter_failed") summary.adaptersFailed++;
    if (e.type !== "adapter_done") continue;
    summary.adaptersOk++;
    for (const p of e.positions) {
      summary.positionCount++;
      const usd = p.estimatedUsdValue;
      if (usd === null) {
        summary.unpricedCount++;
        continue;
      }
      if (p.kind === "wallet_asset") {
        summary.walletAssetUsd += usd;
        continue;
      }
      if (p.kind === "claimable") summary.claimableUsd += usd;
      else summary.pendingUsd += usd;
      summary.byCategory[p.category] = (summary.byCategory[p.category] ?? 0) + usd;
    }
  }
  return summary;
}
