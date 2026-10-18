import { describe, expect, it } from "vitest";
import { ALL_CHAINS, CHAINS, PRIMARY_CHAIN, getChainById, getRpcUrl } from "@/config/chains";

describe("chain config", () => {
  it("has the correct chain IDs", () => {
    expect(CHAINS.robinhood.id).toBe(4663);
    expect(CHAINS.robinhoodTestnet.id).toBe(46630);
    expect(CHAINS.ethereum.id).toBe(1);
    expect(CHAINS.arbitrum.id).toBe(42161);
    expect(CHAINS.base.id).toBe(8453);
    expect(CHAINS.optimism.id).toBe(10);
  });

  it("makes Robinhood mainnet the only primary chain", () => {
    expect(PRIMARY_CHAIN.id).toBe(4663);
    expect(ALL_CHAINS.filter((c) => c.role === "primary")).toEqual([CHAINS.robinhood]);
  });

  it("keeps every non-primary chain read-only", () => {
    for (const chain of ALL_CHAINS.filter((c) => c.role !== "primary")) {
      expect(chain.mode, chain.name).toBe("read-only");
    }
  });

  it("has verified Multicall3 on Robinhood mainnet", () => {
    expect(CHAINS.robinhood.contracts.multicall3).toMatchObject({
      status: "verified",
      value: "0xcA11bde05977b3631167028862bE2a173976CA11",
    });
  });

  it("has the verified canonical bridge on Robinhood mainnet", () => {
    const b = CHAINS.robinhood.contracts.canonicalBridge;
    expect(b.rollup.value).toBe("0x23A19d23e89166adedbDcB432518AB01e4272D94");
    expect(b.outbox.value).toBe("0xf0ce991ea4A0d2400A4AB49b20ae333f6Dce3DE9");
    expect(b.l2Gateways.value).toHaveLength(3);
  });

  it("keeps unverified Robinhood contracts and integrations unset", () => {
    const testnet = CHAINS.robinhoodTestnet.contracts;
    expect(testnet.multicall3.value).toBeNull();
    for (const v of Object.values(testnet.canonicalBridge)) expect(v.value).toBeNull();
    for (const chain of [CHAINS.robinhood, CHAINS.robinhoodTestnet]) {
      const { usdc, dexRouters } = chain.contracts;
      const values = [usdc, dexRouters, ...Object.values(chain.bridgeIntegrations)];
      for (const v of values) {
        expect(v.status).toBe("unverified");
        expect(v.value).toBeNull();
      }
    }
  });

  it("requires a source for every verified value", () => {
    for (const chain of ALL_CHAINS) {
      const m = chain.contracts.multicall3;
      if (m.status === "verified") expect(m.source).toBeTruthy();
    }
  });

  it("uses an env RPC override when set, else the public RPC", () => {
    expect(getRpcUrl(CHAINS.robinhood, {})).toBe("https://rpc.mainnet.chain.robinhood.com");
    expect(
      getRpcUrl(CHAINS.robinhood, { RPC_URL_ROBINHOOD_MAINNET: "https://private.example" }),
    ).toBe("https://private.example");
  });

  it("looks chains up by id", () => {
    expect(getChainById(4663)?.key).toBe("robinhood");
    expect(getChainById(999999)).toBeUndefined();
  });
});
