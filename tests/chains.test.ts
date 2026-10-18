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

  it("keeps unverified Robinhood contracts and integrations unset", () => {
    for (const chain of [CHAINS.robinhood, CHAINS.robinhoodTestnet]) {
      const { multicall3, usdc, canonicalBridge, dexRouters } = chain.contracts;
      const values = [
        multicall3,
        usdc,
        dexRouters,
        canonicalBridge.inbox,
        canonicalBridge.outbox,
        canonicalBridge.rollup,
        ...Object.values(chain.bridgeIntegrations),
      ];
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
