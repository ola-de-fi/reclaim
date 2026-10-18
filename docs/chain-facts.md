# Chain facts

The source of truth for what Reclaim knows about each network. Anything not in **Verified** is
kept as `status: "unverified"` (value `null`) in `config/chains.ts` and must not be used.

## Verified — Robinhood Chain

| Property                  | Mainnet                                                                                           | Testnet                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Chain ID                  | `4663`                                                                                            | `46630`                                      |
| Gas token                 | ETH                                                                                               | ETH                                          |
| Public RPC (rate-limited) | `https://rpc.mainnet.chain.robinhood.com`                                                         | `https://rpc.testnet.chain.robinhood.com`    |
| Explorer                  | https://robinhoodchain.blockscout.com                                                             | https://explorer.testnet.chain.robinhood.com |
| Stack                     | Arbitrum-based Ethereum L2                                                                        | same                                         |
| Settles to                | Ethereum                                                                                          | —                                            |
| Canonical bridge          | Arbitrum canonical bridge, ~7-day withdrawal challenge period                                     | —                                            |
| Multicall3                | `0xcA11bde05977b3631167028862bE2a173976CA11` (bytecode identical to Ethereum, checked 2026-10-18) | unverified                                   |

Secondary chains (Ethereum, Arbitrum, Base, Optimism) use viem's maintained chain definitions,
including their Multicall3 addresses.

## Verified — canonical bridge (mainnet)

From [Protocol Contracts](https://docs.robinhood.com/chain/protocol-contracts), cross-checked
onchain 2026-10-18: `Rollup.chainId()` = 4663, and Rollup / Bridge / Outbox / Delayed Inbox all
reference each other. The rollup is BoLD (`latestConfirmed()` returns an assertion hash);
`confirmPeriodBlocks` = 45,818 (~6.4 days).

| Contract (Ethereum) | Address                                      |
| ------------------- | -------------------------------------------- |
| Rollup              | `0x23A19d23e89166adedbDcB432518AB01e4272D94` |
| Bridge              | `0xDf8755334ce7A73cCF6b581C02eA649AE3E864b3` |
| Outbox              | `0xf0ce991ea4A0d2400A4AB49b20ae333f6Dce3DE9` |
| Delayed Inbox       | `0x1A07cc4BD17E0118BdB54D70990D2158AbAD7a2D` |

L2 token gateways (emit `WithdrawalInitiated`): ERC20 `0xfd9b17206278C16DdaacF6AC8f05dBf97EdCb31e`,
Arb-Custom `0x912285144fC0f6e89d3Ed16F5Ab72f87A1878959`, WETH `0x1D187C3E2dA52D72BC9C41e3AbA0fdFa6a7bF055`.

### RPC quirks (public Robinhood RPC)

- `eth_getLogs` allows at most 10,000,000 blocks (inclusive) for a single address, but only
  100,000 when filtering several addresses at once. Query one address at a time.
- JSON-RPC batching returns malformed responses. Leave viem `batch` off.
- Blockscout is behind a Cloudflare challenge, so it cannot be used server-side.
- A full-history withdrawal scan takes ~15–20s on the public RPC. A private RPC should be faster.

## Unverified — Robinhood Chain

- Canonical USDC address and liquidity
- DEX routers
- Bridge integrations listed in the docs — Relay, Across, LayerZero, Chainlink CCIP, LI.FI, 0x —
  per-route and per-asset support not checked
- Indexed token-balance provider that supports chain 4663
- Merkle distributor contracts and proof sources
- Wallet support for EIP-5792 batched calls on chain 4663

## Sources

- Docs home: https://docs.robinhood.com/chain/
- Connecting (RPCs, chain IDs): https://docs.robinhood.com/chain/connecting/
- Bridging: https://docs.robinhood.com/chain/bridging/
- Explorer: https://robinhoodchain.blockscout.com

## Before building adapters (Phase 3)

1. Verify each contract on the explorer (verified source, matches docs) and add it to
   `config/chains.ts` with `status: "verified"` and a `source` link.
2. Confirm the Arbitrum Outbox withdrawal flow on Robinhood Chain (event names, proof RPC).
3. Pick an indexed balance provider; Multicall alone can't discover unknown tokens.
4. Check Relay / Across APIs for chain 4663 refund and stuck-fill endpoints.
