import { erc20Abi, formatUnits, type Address } from "viem";
import { CHAINS, type ChainConfig } from "@/config/chains";
import { ETH_USD_FEED, ROBINHOOD_TOKENS, type KnownToken } from "@/config/tokens";
import { readMany } from "../multicall";
import { priceOf, readUsdPrices } from "../prices";
import type { ClaimablePosition, ProtocolAdapter, ScanContext } from "../types";

/**
 * ETH and known bridged-token balances on Robinhood Chain.
 * These are already in the wallet, so they are reported as `wallet_asset` and never counted
 * as recoverable. They're shown so users see what they hold on a chain they may have forgotten.
 *
 * Covers the curated token list only. Discovering arbitrary tokens needs an indexer.
 */
export function createTokenBalancesAdapter(
  chain: ChainConfig = CHAINS.robinhood,
  tokens: KnownToken[] = ROBINHOOD_TOKENS,
): ProtocolAdapter {
  const id = `balances-${chain.id}`;
  const parent = chain.settlesTo ? CHAINS[chain.settlesTo] : CHAINS.ethereum;

  return {
    id,
    name: `${chain.name} balances`,
    category: "dust",
    supportedChainIds: [chain.id],

    async scanAddress(user: Address, ctx: ScanContext): Promise<ClaimablePosition[]> {
      const l2 = ctx.getClient(chain.id);
      const [native, balances, prices] = await Promise.all([
        l2.getBalance({ address: user }),
        readMany(
          l2,
          tokens.map((t) => ({
            address: t.l2,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [user],
          })),
        ),
        readUsdPrices(ctx.getClient(parent.id), [
          ETH_USD_FEED,
          ...tokens.flatMap((t) => (t.usdFeed ? [t.usdFeed] : [])),
        ]).catch(() => new Map<string, number>()),
      ]);

      const holdings: Array<{
        symbol: string;
        address: Address | "native";
        decimals: number;
        raw: bigint;
        usd: number | null;
      }> = [];
      if (native > 0n) {
        holdings.push({
          symbol: chain.nativeCurrency.symbol,
          address: "native",
          decimals: chain.nativeCurrency.decimals,
          raw: native,
          usd: priceOf(prices, ETH_USD_FEED),
        });
      }
      tokens.forEach((t, i) => {
        const r = balances[i];
        if (r?.status !== "success" || typeof r.result !== "bigint" || r.result === 0n) return;
        holdings.push({
          symbol: t.symbol,
          address: t.l2,
          decimals: t.decimals,
          raw: r.result,
          usd: priceOf(prices, t.usdFeed),
        });
      });

      return holdings.map((h) => {
        const amount = formatUnits(h.raw, h.decimals);
        return {
          id: `${id}:${h.address}`,
          adapterId: id,
          protocol: "Wallet balance",
          chainId: chain.id,
          kind: "wallet_asset",
          category: "dust",
          asset: { symbol: h.symbol, address: h.address, decimals: h.decimals },
          amountRaw: h.raw.toString(),
          amountFormatted: Number(amount).toLocaleString("en-US", { maximumFractionDigits: 6 }),
          estimatedUsdValue: h.usd === null ? null : Number(amount) * h.usd,
          claimAction: { type: "none" },
          risk: { verified: true },
          source:
            h.address === "native"
              ? `${chain.explorer.url}/address/${user}`
              : `${chain.explorer.url}/token/${h.address}?a=${user}`,
        };
      });
    },
  };
}
