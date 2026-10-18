import { describe, expect, it } from "vitest";
import { encodeFunctionData, parseAbi, type Address } from "viem";
import { CHAINS } from "@/config/chains";
import {
  applyL1ToL2Alias,
  classifyTicket,
  type TicketTx,
} from "@/lib/scanner/adapters/arbitrum-retryables";

const USER: Address = "0x1111111111111111111111111111111111111111";
const ATTACKER: Address = "0x2222222222222222222222222222222222222222";
const USDC_L1: Address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const UNKNOWN_L1: Address = "0x3333333333333333333333333333333333333333";
const gwCfg = CHAINS.robinhood.contracts.canonicalBridge.l2Gateways;
const GATEWAYS = gwCfg.status === "verified" ? gwCfg.value : [];
const ERC20_GW = GATEWAYS[0]!;
const L1_ALIASES = [applyL1ToL2Alias("0x85001CC4867C5e1C22dA4B79BB8852B9e2a06da0")];

const abi = parseAbi([
  "function finalizeInboundTransfer(address _token, address _from, address _to, uint256 _amount, bytes _data)",
]);
const finalize = (token: Address, to: Address, amount: bigint) =>
  encodeFunctionData({
    abi,
    functionName: "finalizeInboundTransfer",
    args: [token, USER, to, amount, "0x"],
  });

const tx = (p: Partial<TicketTx>): TicketTx => ({ hash: "0xabc", ...p });

describe("applyL1ToL2Alias", () => {
  it("matches the observed live ticket sender", () => {
    expect(L1_ALIASES[0]).toBe("0x96111cc4867c5e1c22da4b79bb8852b9e2a07eb1");
  });
});

describe("classifyTicket", () => {
  it("matches a legit gateway token deposit to the user", () => {
    const c = classifyTicket(
      tx({
        from: L1_ALIASES[0] as Address,
        retryTo: ERC20_GW,
        retryData: finalize(USDC_L1, USER, 5n),
      }),
      USER,
      GATEWAYS,
      L1_ALIASES,
    );
    expect(c).toEqual({ kind: "token", deposit: { l1Token: USDC_L1, to: USER, amount: 5n } });
  });

  it("rejects an attacker retryTo carrying real-USDC calldata", () => {
    const t = tx({
      beneficiary: USER,
      retryTo: ATTACKER,
      retryData: finalize(USDC_L1, USER, 10n ** 12n),
    });
    expect(classifyTicket(t, USER, GATEWAYS, L1_ALIASES)).toBeNull();
  });

  it("rejects a real gateway ticket not sent by an aliased L1 gateway", () => {
    const t = tx({ from: ATTACKER, retryTo: ERC20_GW, retryData: finalize(USDC_L1, USER, 1n) });
    expect(classifyTicket(t, USER, GATEWAYS, L1_ALIASES)).toBeNull();
  });

  it("matches an ETH deposit to the user with empty calldata", () => {
    const t = tx({ retryTo: USER, retryData: "0x", retryValue: "0x10" });
    expect(classifyTicket(t, USER, GATEWAYS, L1_ALIASES)).toEqual({ kind: "eth", amount: 16n });
  });

  it("skips retryTo == user with non-empty data", () => {
    const t = tx({ retryTo: USER, retryData: "0xdeadbeef", retryValue: "0x10" });
    expect(classifyTicket(t, USER, GATEWAYS)).toBeNull();
  });

  it("skips beneficiary-only tickets", () => {
    const t = tx({ beneficiary: USER, retryTo: ATTACKER, retryData: "0x" });
    expect(classifyTicket(t, USER, GATEWAYS, L1_ALIASES)).toBeNull();
  });

  it("classifies an unknown token through a real gateway as a token deposit (priced as unverified)", () => {
    const t = tx({
      from: L1_ALIASES[0] as Address,
      retryTo: ERC20_GW,
      retryData: finalize(UNKNOWN_L1, USER, 7n),
    });
    const c = classifyTicket(t, USER, GATEWAYS, L1_ALIASES);
    expect(c?.kind).toBe("token");
  });
});
