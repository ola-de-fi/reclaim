import { describe, expect, it } from "vitest";
import type { Address } from "viem";
import { getAdapters } from "@/lib/scanner";
import { mockAdapter } from "@/lib/scanner/adapters/mock";
import { runScan, type ScanEvent } from "@/lib/scanner/engine";
import type { ClaimablePosition, ProtocolAdapter, ScanContext } from "@/lib/scanner/types";

const WALLET = "0x1111111111111111111111111111111111111111" as Address;

const ctx = (signal: AbortSignal): ScanContext => ({
  getClient: () => {
    throw new Error("no client in tests");
  },
  signal,
  logger: { info() {}, warn() {} },
});

function position(adapterId: string, over: Partial<ClaimablePosition> = {}): ClaimablePosition {
  return {
    id: `${adapterId}:1`,
    adapterId,
    protocol: "Test",
    chainId: 4663,
    kind: "claimable",
    category: "airdrop",
    asset: { symbol: "ETH", address: "native", decimals: 18 },
    amountRaw: "1",
    amountFormatted: "1",
    estimatedUsdValue: 10,
    claimAction: { type: "none" },
    risk: { verified: true },
    source: "https://example.com",
    ...over,
  };
}

function adapter(
  id: string,
  scan: ProtocolAdapter["scanAddress"],
  supportedChainIds = [4663],
): ProtocolAdapter {
  return { id, name: id, category: "airdrop", supportedChainIds, scanAddress: scan };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function collect(gen: AsyncGenerator<ScanEvent>) {
  const events: ScanEvent[] = [];
  for await (const e of gen) events.push(e);
  return events;
}

const doneSummary = (events: ScanEvent[]) => {
  const last = events.at(-1);
  if (last?.type !== "scan_done") throw new Error("scan did not finish");
  return last.summary;
};

describe("runScan", () => {
  it("streams results in completion order, then a summary", async () => {
    const events = await collect(
      runScan(
        WALLET,
        [
          adapter("slow", async () => (await sleep(30), [position("slow")])),
          adapter("fast", async () => [position("fast", { estimatedUsdValue: 5 })]),
        ],
        ctx,
      ),
    );
    expect(events[0]).toMatchObject({ type: "scan_started", adapterIds: ["slow", "fast"] });
    const done = events.filter((e) => e.type === "adapter_done").map((e) => e.adapterId);
    expect(done).toEqual(["fast", "slow"]);
    expect(doneSummary(events)).toMatchObject({ claimableUsd: 15, adaptersOk: 2 });
  });

  it("isolates an adapter that throws", async () => {
    const events = await collect(
      runScan(
        WALLET,
        [
          adapter("boom", async () => {
            throw new Error("rpc down");
          }),
          adapter("ok", async () => [position("ok")]),
        ],
        ctx,
      ),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "adapter_failed",
        adapterId: "boom",
        error: "rpc down",
        timedOut: false,
      }),
    );
    expect(doneSummary(events)).toMatchObject({
      adaptersOk: 1,
      adaptersFailed: 1,
      claimableUsd: 10,
    });
  });

  it("times out a hanging adapter and aborts its signal", async () => {
    let aborted = false;
    const events = await collect(
      runScan(
        WALLET,
        [
          adapter("hang", (_, c) => {
            c.signal.addEventListener("abort", () => (aborted = true));
            return new Promise(() => {});
          }),
        ],
        ctx,
        { timeoutMs: 20 },
      ),
    );
    expect(events).toContainEqual(
      expect.objectContaining({ type: "adapter_failed", timedOut: true }),
    );
    expect(aborted).toBe(true);
  });

  it("drops invalid positions and positions claimed under another adapter's id", async () => {
    const events = await collect(
      runScan(
        WALLET,
        [
          adapter("a", async () => [
            position("a"),
            position("someone-else"),
            { ...position("a"), amountRaw: "-5" },
            position("a", { claimAction: { type: "external", url: "http://insecure.example" } }),
          ]),
        ],
        ctx,
      ),
    );
    const done = events.find((e) => e.type === "adapter_done");
    expect(done).toMatchObject({ dropped: 3 });
    expect(done?.type === "adapter_done" && done.positions).toHaveLength(1);
  });

  it("never counts wallet assets or unpriced positions as recoverable", async () => {
    const events = await collect(
      runScan(
        WALLET,
        [
          adapter("a", async () => [
            position("a", {
              id: "1",
              kind: "wallet_asset",
              category: "dust",
              estimatedUsdValue: 100,
            }),
            position("a", { id: "2", kind: "pending", category: "bridge", estimatedUsdValue: 40 }),
            position("a", { id: "3", kind: "claimable", estimatedUsdValue: null }),
          ]),
        ],
        ctx,
      ),
    );
    expect(doneSummary(events)).toEqual(
      expect.objectContaining({
        claimableUsd: 0,
        pendingUsd: 40,
        walletAssetUsd: 100,
        byCategory: { bridge: 40 },
        positionCount: 3,
        unpricedCount: 1,
      }),
    );
  });

  it("only runs adapters for the requested chains", async () => {
    const events = await collect(
      runScan(WALLET, [adapter("rh", async () => []), adapter("eth", async () => [], [1])], ctx, {
        chainIds: [4663],
      }),
    );
    expect(events[0]).toMatchObject({ adapterIds: ["rh"] });
  });

  it("finishes cleanly with no adapters", async () => {
    const events = await collect(runScan(WALLET, [], ctx));
    expect(events.map((e) => e.type)).toEqual(["scan_started", "scan_done"]);
  });

  it("marks every adapter failed when the scan is aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const events = await collect(
      runScan(WALLET, [adapter("a", async () => [position("a")])], ctx, {
        signal: controller.signal,
      }),
    );
    expect(doneSummary(events)).toMatchObject({ adaptersOk: 0, adaptersFailed: 1 });
  });
});

describe("adapter registry", () => {
  it("uses real adapters by default and the mock only when enabled outside production", () => {
    const real = getAdapters({}).map((a) => a.id);
    expect(real).toEqual(["arb-outbox-4663"]);
    expect(getAdapters({ SCANNER_MOCK: "1", NODE_ENV: "development" })).toEqual([mockAdapter]);
    expect(getAdapters({ SCANNER_MOCK: "1", NODE_ENV: "production" }).map((a) => a.id)).toEqual(
      real,
    );
  });

  it("mock adapter output passes validation", async () => {
    const events = await collect(runScan(WALLET, [mockAdapter], ctx));
    expect(events.find((e) => e.type === "adapter_done")).toMatchObject({ dropped: 0 });
  });
});
