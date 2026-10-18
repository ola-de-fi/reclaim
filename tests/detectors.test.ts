import { describe, expect, it } from "vitest";
import { encodeFunctionData, type Address, type PublicClient } from "viem";
import { inspectClaim } from "@/lib/claims/inspect";
import {
  ARB_RETRYABLE_TX,
  decodeGatewayDeposit,
  gatewayFinalizeAbi,
  retryableAbi,
} from "@/lib/claims/retryable";
import { createTokenBalancesAdapter } from "@/lib/scanner/adapters/robinhood-tokens";
import { readUsdPrices } from "@/lib/scanner/prices";
import { ROBINHOOD_TOKENS } from "@/config/tokens";
import { CHAINS } from "@/config/chains";
import type { ScanContext } from "@/lib/scanner/types";

const USER: Address = "0x380c87712Bd7bF34F8645d5674aB065Ca249de79";
const TICKET = `0x${"ab".repeat(32)}` as const;
const redeem = encodeFunctionData({ abi: retryableAbi, functionName: "redeem", args: [TICKET] });

describe("inspectClaim: retryable redeem", () => {
  it("allows redeem on Robinhood Chain and describes it", () => {
    const r = inspectClaim(ARB_RETRYABLE_TX, redeem, 4663);
    expect(r).toMatchObject({
      ok: true,
      claim: { kind: "retryable-redeem", functionName: "redeem", recipient: null, decoded: null },
    });
  });

  it("refuses redeem on chains without a verified Arbitrum bridge", () => {
    expect(inspectClaim(ARB_RETRYABLE_TX, redeem, 1).ok).toBe(false);
    expect(inspectClaim(ARB_RETRYABLE_TX, redeem, 46630).ok).toBe(false);
  });

  it("refuses other calls to the precompile", () => {
    const other = encodeFunctionData({
      abi: retryableAbi,
      functionName: "getTimeout",
      args: [TICKET],
    });
    expect(inspectClaim(ARB_RETRYABLE_TX, other, 4663).ok).toBe(false);
  });
});

describe("decodeGatewayDeposit", () => {
  it("decodes a token gateway deposit and ignores other calldata", () => {
    const data = encodeFunctionData({
      abi: gatewayFinalizeAbi,
      functionName: "finalizeInboundTransfer",
      args: [ROBINHOOD_TOKENS[1]!.l1, USER, USER, 5_000_000n, "0x"],
    });
    expect(decodeGatewayDeposit(data)).toEqual({
      l1Token: ROBINHOOD_TOKENS[1]!.l1,
      from: USER,
      to: USER,
      amount: 5_000_000n,
    });
    expect(decodeGatewayDeposit("0x")).toBeNull();
  });
});

describe("readUsdPrices", () => {
  const feed = (answer: bigint, updatedAt: number) => ({
    status: "success" as const,
    result: [1n, answer, 0n, BigInt(updatedAt), 1n],
  });
  it("drops stale and non-positive feeds", async () => {
    const now = 1_000_000;
    const l1 = {
      chain: {
        contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } },
      },
      multicall: async () => [
        feed(2_000n * 10n ** 8n, now - 60),
        feed(10n ** 8n, now - 3 * 86_400),
        feed(0n, now),
      ],
    } as unknown as PublicClient;
    const prices = await readUsdPrices(
      l1,
      [
        "0x0000000000000000000000000000000000000001",
        "0x0000000000000000000000000000000000000002",
        "0x0000000000000000000000000000000000000003",
      ],
      now,
    );
    expect([...prices.values()]).toEqual([2000]);
  });
});

describe("token balances adapter", () => {
  it("reports non-zero balances as wallet assets, priced via feeds", async () => {
    const now = Math.floor(Date.now() / 1000);
    const l2 = {
      chain: {
        contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } },
      },
      getBalance: async () => 10n ** 17n,
      multicall: async ({ contracts }: { contracts: { address: string }[] }) =>
        contracts.map((c) => ({
          status: "success",
          result: c.address === ROBINHOOD_TOKENS[1]!.l2 ? 2_500_000n : 0n,
        })),
    };
    const l1 = {
      chain: l2.chain,
      multicall: async ({ contracts }: { contracts: unknown[] }) =>
        contracts.map((_, i) => ({
          status: "success",
          result: [1n, i === 0 ? 2000n * 10n ** 8n : 10n ** 8n, 0n, BigInt(now), 1n],
        })),
    };
    const ctx: ScanContext = {
      getClient: (id) => (id === CHAINS.robinhood.id ? l2 : l1) as unknown as PublicClient,
      signal: new AbortController().signal,
      logger: { info() {}, warn() {} },
    };
    const positions = await createTokenBalancesAdapter().scanAddress(USER, ctx);
    expect(
      positions.map((p) => [p.asset.symbol, p.kind, p.amountFormatted, p.estimatedUsdValue]),
    ).toEqual([
      ["ETH", "wallet_asset", "0.1", 200],
      ["USDC", "wallet_asset", "2.5", 2.5],
    ]);
  });
});
