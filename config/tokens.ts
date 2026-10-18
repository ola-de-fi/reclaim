import type { Address } from "viem";

/**
 * Bridged tokens on Robinhood Chain that Reclaim knows about.
 *
 * Verified 2026-10-18: the L2 address equals L2GatewayRouter.calculateL2TokenAddress(l1) and the
 * token's l1Address() points back to the L1 token. Price feeds are Chainlink on Ethereum, checked
 * by description(). DAI and AAVE have no bridged token yet.
 */
export interface KnownToken {
  symbol: string;
  decimals: number;
  l1: Address;
  l2: Address;
  /** Chainlink USD feed on Ethereum (8 decimals). WBTC uses BTC / USD. */
  usdFeed: Address | null;
}

export const ETH_USD_FEED: Address = "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419";

export const ROBINHOOD_TOKENS: KnownToken[] = [
  {
    symbol: "WETH",
    decimals: 18,
    l1: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    l2: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73",
    usdFeed: ETH_USD_FEED,
  },
  {
    symbol: "USDC",
    decimals: 6,
    l1: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    l2: "0x80e0e24718dbFcad49ECAA6F1e6C89A190586cA8",
    usdFeed: "0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6",
  },
  {
    symbol: "USDT",
    decimals: 6,
    l1: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    l2: "0xE246BC49b0598d7Cd9f0eAD48B885034f1254380",
    usdFeed: "0x3E7d1eAB13ad0104d2750B8863b489D65364e32D",
  },
  {
    symbol: "WBTC",
    decimals: 8,
    l1: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
    l2: "0x6bac06600D220Ac5Ac281AD1f504D2Cf0F90F6e6",
    usdFeed: "0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c",
  },
  {
    symbol: "LINK",
    decimals: 18,
    l1: "0x514910771AF9Ca656af840dff83E8264EcF986CA",
    l2: "0x0822560CBDB92a0Af70397379ddb4Dcc4C95C8a7",
    usdFeed: "0x2c1d072e956AFFC0D435Cb7AC38EF18d24d9127c",
  },
  {
    symbol: "UNI",
    decimals: 18,
    l1: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984",
    l2: "0xF177d86a28b520e3E396E4F3B96cd8e72D7dabd8",
    usdFeed: "0x553303d460EE0afB37EdFf9bE42922D8FF63220e",
  },
];

export function tokenByL1(l1: string): KnownToken | undefined {
  return ROBINHOOD_TOKENS.find((t) => t.l1.toLowerCase() === l1.toLowerCase());
}
