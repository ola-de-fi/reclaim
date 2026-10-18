import { describe, expect, it } from "vitest";
import { encodeFunctionData, parseAbi, parseEther, type Address } from "viem";
import { inspectOutboxClaim, outboxAbi } from "@/lib/claims/outbox";

const OUTBOX: Address = "0xf0ce991ea4A0d2400A4AB49b20ae333f6Dce3DE9";
const USER: Address = "0x380c87712Bd7bF34F8645d5674aB065Ca249de79";
const L1_GATEWAY: Address = "0x85001CC4867C5e1C22dA4B79BB8852B9e2a06da0";
const UNI: Address = "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984";

const execute = (to: Address, value: bigint, data: `0x${string}` = "0x") =>
  encodeFunctionData({
    abi: outboxAbi,
    functionName: "executeTransaction",
    args: [[], 1787n, USER, to, 1n, 2n, 3n, value, data],
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
    const inner = encodeFunctionData({
      abi: parseAbi([
        "function finalizeInboundTransfer(address token, address from, address to, uint256 amount, bytes data)",
      ]),
      functionName: "finalizeInboundTransfer",
      args: [UNI, USER, USER, 5n * 10n ** 18n, "0x"],
    });
    const r = inspectOutboxClaim(OUTBOX, execute(L1_GATEWAY, 0n, inner), 1);
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
});
