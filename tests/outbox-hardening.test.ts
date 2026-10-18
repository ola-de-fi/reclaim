import { describe, expect, it } from "vitest";
import type { Address } from "viem";
import { mapPool, MAX_WITHDRAWALS, sanitizeSymbol } from "@/lib/scanner/adapters/arbitrum-outbox";
import { runScan, type ScanEvent } from "@/lib/scanner/engine";
import { MAX_HEX_CHARS, positionSchema } from "@/lib/scanner/schema";
import type { ClaimablePosition, ScanContext } from "@/lib/scanner/types";

const WALLET = "0x1111111111111111111111111111111111111111" as Address;
const TO = "0x2222222222222222222222222222222222222222" as Address;

const ctx = (signal: AbortSignal): ScanContext => ({
  getClient: () => {
    throw new Error("no client in tests");
  },
  signal,
  logger: { info() {}, warn() {} },
});

function position(over: Partial<ClaimablePosition> = {}): ClaimablePosition {
  return {
    id: "t:1",
    adapterId: "t",
    protocol: "Test",
    chainId: 4663,
    kind: "claimable",
    category: "bridge",
    asset: { symbol: "ETH", address: "native", decimals: 18 },
    amountRaw: "1",
    amountFormatted: "1",
    estimatedUsdValue: 1,
    claimAction: { type: "none" },
    risk: { verified: true },
    source: "https://example.com",
    ...over,
  };
}

async function scanDropped(p: ClaimablePosition) {
  const events: ScanEvent[] = [];
  for await (const e of runScan(
    WALLET,
    [
      {
        id: "t",
        name: "t",
        category: "bridge",
        supportedChainIds: [4663],
        scanAddress: async () => [p],
      },
    ],
    ctx,
  ))
    events.push(e);
  const done = events.find((e) => e.type === "adapter_done");
  if (done?.type !== "adapter_done") throw new Error("no adapter_done");
  return done.dropped;
}

const long = (n: number) => "a".repeat(n);
const step = { label: "s", chainId: 1, to: TO, data: "0x" as const };

describe("schema caps", () => {
  it("accepts a normal position", async () => {
    expect(await scanDropped(position())).toBe(0);
  });

  it.each<[string, Partial<ClaimablePosition>]>([
    ["symbol", { asset: { symbol: long(17), address: "native", decimals: 18 } }],
    ["amountFormatted", { amountFormatted: long(41) }],
    ["protocol", { protocol: long(81) }],
    ["notes", { risk: { verified: true, notes: long(301) } }],
    ["source", { source: long(301) }],
    ["id", { id: long(201) }],
    [
      "direct data",
      {
        claimAction: { type: "direct", chainId: 1, to: TO, data: `0x${"0".repeat(MAX_HEX_CHARS)}` },
      },
    ],
    ["steps", { claimAction: { type: "multi_step", steps: Array(11).fill(step) } }],
    ["http url", { claimAction: { type: "external", url: "http://example.com" } }],
  ])("drops oversize %s", async (_, over) => {
    expect(await scanDropped(position(over))).toBe(1);
  });

  it("accepts values at the caps", () => {
    const p = position({
      asset: { symbol: long(16), address: "native", decimals: 18 },
      amountFormatted: long(40),
      protocol: long(80),
      risk: { verified: false, notes: long(300) },
      source: long(300),
      claimAction: { type: "multi_step", steps: Array(10).fill(step) },
    });
    expect(positionSchema.safeParse(p).success).toBe(true);
  });
});

describe("sanitizeSymbol", () => {
  it("strips non-printable characters and caps length", () => {
    expect(sanitizeSymbol("US​DC\n")).toBe("USDC");
    expect(sanitizeSymbol("ＵＳＤＣ")).toBe("TOKEN");
    expect(sanitizeSymbol("A".repeat(50))).toHaveLength(12);
    expect(sanitizeSymbol("visit x.com")).toBe("visitx.com");
    expect(sanitizeSymbol(undefined)).toBe("TOKEN");
  });
});

describe("mapPool", () => {
  it("keeps order and limits concurrency", async () => {
    let active = 0;
    let peak = 0;
    const out = await mapPool([5, 1, 3, 2, 4, 0], 2, async (n) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, n));
      active--;
      return n * 10;
    });
    expect(out).toEqual([50, 10, 30, 20, 40, 0]);
    expect(peak).toBe(2);
  });

  it("stops when aborted", async () => {
    const c = new AbortController();
    let calls = 0;
    await expect(
      mapPool(
        [1, 2, 3, 4],
        1,
        async () => {
          calls++;
          c.abort();
        },
        c.signal,
      ),
    ).rejects.toThrow("aborted");
    expect(calls).toBe(1);
  });

  it("handles empty input", async () => {
    expect(await mapPool([], 4, async () => 1)).toEqual([]);
    expect(MAX_WITHDRAWALS).toBe(200);
  });
});
