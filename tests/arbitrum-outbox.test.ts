import { describe, expect, it } from "vitest";
import { blockChunks, classifyWithdrawal } from "@/lib/scanner/adapters/arbitrum-outbox";

describe("blockChunks", () => {
  it("covers the whole range in inclusive chunks without gaps or overlap", () => {
    expect(blockChunks(0n, 25n, 9n)).toEqual([
      [0n, 9n],
      [10n, 19n],
      [20n, 25n],
    ]);
  });

  it("stays within Robinhood's 10,000,000-block limit", () => {
    for (const [from, to] of blockChunks(0n, 92_031_985n)) {
      expect(to - from + 1n).toBeLessThanOrEqual(10_000_000n);
    }
  });

  it("handles a single block", () => {
    expect(blockChunks(5n, 5n)).toEqual([[5n, 5n]]);
  });
});

describe("classifyWithdrawal", () => {
  it("is claimable once the confirmed sendCount has passed its position", () => {
    expect(classifyWithdrawal(3000n, 3170n, 0n, 600)).toEqual({ kind: "claimable" });
  });

  it("is pending at or beyond the confirmed sendCount, ready after the challenge period", () => {
    expect(classifyWithdrawal(3170n, 3170n, 1_000n, 600)).toEqual({
      kind: "pending",
      readyAt: 1_000 + 600 + 3600,
    });
    expect(classifyWithdrawal(3304n, 3170n, 1_000n, 600).kind).toBe("pending");
  });
});
