import { describe, expect, it } from "vitest";
import { encodeFunctionData, parseAbi, parseEther, type Address } from "viem";
import { inspectOutboxClaim, outboxAbi } from "@/lib/claims/outbox";
import { inspectClaim } from "@/lib/claims/inspect";
import { ARB_RETRYABLE_TX, retryableAbi } from "@/lib/claims/retryable";

const OUTBOX: Address = "0xf0ce991ea4A0d2400A4AB49b20ae333f6Dce3DE9";
const USER: Address = "0x380c87712Bd7bF34F8645d5674aB065Ca249de79";
const L1_GATEWAY: Address = "0x85001CC4867C5e1C22dA4B79BB8852B9e2a06da0";
const L2_GATEWAY: Address = "0xfd9b17206278C16DdaacF6AC8f05dBf97EdCb31e";
const L2_CUSTOM_GATEWAY: Address = "0x912285144fC0f6e89d3Ed16F5Ab72f87A1878959";
const UNI: Address = "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984";

const execute = (
  to: Address,
  value: bigint,
  data: `0x${string}` = "0x",
  l2Sender: Address = data === "0x" ? USER : L2_GATEWAY,
) =>
  encodeFunctionData({
    abi: outboxAbi,
    functionName: "executeTransaction",
    args: [[], 1787n, l2Sender, to, 1n, 2n, 3n, value, data],
  });

const finalize = encodeFunctionData({
  abi: parseAbi([
    "function finalizeInboundTransfer(address token, address from, address to, uint256 amount, bytes data)",
  ]),
  functionName: "finalizeInboundTransfer",
  args: [UNI, USER, USER, 5n * 10n ** 18n, "0x"],
});

describe("inspectOutboxClaim", () => {
  it("accepts an ETH withdrawal to the verified Robinhood Outbox and decodes it", () => {
    const r = inspectOutboxClaim(OUTBOX, execute(USER, parseEther("0.2")), 1);
    expect(r).toMatchObject({
      ok: true,
      claim: {
        l2ChainName: "Robinhood Chain",
        index: 1787n,
        recipient: USER,
        value: parseEther("0.2"),
      },
    });
  });

  it("decodes the real recipient of a token withdrawal from the gateway call", () => {
    const r = inspectOutboxClaim(OUTBOX, execute(L1_GATEWAY, 0n, finalize), 1);
    expect(r.ok && r.claim.token).toEqual({
      address: UNI,
      amount: 5n * 10n ** 18n,
      recipient: USER,
    });
  });

  it("blocks any contract that is not a verified Outbox", () => {
    const r = inspectOutboxClaim(
      "0x000000000000000000000000000000000000dEaD",
      execute(USER, 1n),
      1,
    );
    expect(r).toMatchObject({ ok: false });
  });

  it("blocks the right Outbox on the wrong chain", () => {
    expect(inspectOutboxClaim(OUTBOX, execute(USER, 1n), 4663).ok).toBe(false);
  });

  it("blocks calldata that is not executeTransaction", () => {
    const transfer = encodeFunctionData({
      abi: parseAbi(["function approve(address, uint256)"]),
      functionName: "approve",
      args: [USER, 2n ** 256n - 1n],
    });
    expect(inspectOutboxClaim(OUTBOX, transfer, 1).ok).toBe(false);
    expect(
      inspectOutboxClaim(
        OUTBOX,
        encodeFunctionData({ abi: outboxAbi, functionName: "isSpent", args: [1n] }),
        1,
      ).ok,
    ).toBe(false);
  });

  it("accepts a token claim through a verified gateway pair", () => {
    const r = inspectOutboxClaim(OUTBOX, execute(L1_GATEWAY, 0n, finalize, L2_GATEWAY), 1);
    expect(r).toMatchObject({ ok: true, claim: { recipient: USER } });
  });

  it("refuses a token claim whose target is not a verified L1 gateway", () => {
    const r = inspectOutboxClaim(OUTBOX, execute(UNI, 0n, finalize, L2_GATEWAY), 1);
    expect(r).toMatchObject({ ok: false, reason: "Not a canonical token withdrawal." });
  });

  it("refuses a token claim whose l2Sender is not the paired L2 gateway", () => {
    expect(inspectOutboxClaim(OUTBOX, execute(L1_GATEWAY, 0n, finalize, USER), 1).ok).toBe(false);
    expect(
      inspectOutboxClaim(OUTBOX, execute(L1_GATEWAY, 0n, finalize, L2_CUSTOM_GATEWAY), 1).ok,
    ).toBe(false);
  });

  it("refuses an ETH-style claim to a user with non-empty innerData", () => {
    expect(inspectOutboxClaim(OUTBOX, execute(USER, 1n, "0xdeadbeef", USER), 1).ok).toBe(false);
  });

  it("refuses outbox calldata with trailing bytes", () => {
    const data = `${execute(USER, 1n)}00ff` as const;
    expect(inspectOutboxClaim(OUTBOX, data, 1).ok).toBe(false);
  });
});

describe("inspectClaim redeem", () => {
  const ticket = `0x${"11".repeat(32)}` as const;
  const redeem = encodeFunctionData({ abi: retryableAbi, functionName: "redeem", args: [ticket] });

  it("accepts a well-formed redeem on Robinhood Chain", () => {
    expect(inspectClaim(ARB_RETRYABLE_TX, redeem, 4663).ok).toBe(true);
  });

  it("refuses redeem calldata with trailing bytes", () => {
    expect(inspectClaim(ARB_RETRYABLE_TX, `${redeem}abcd`, 4663).ok).toBe(false);
  });
});
