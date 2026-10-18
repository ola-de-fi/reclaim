# Chain facts

The source of truth for what Reclaim knows about each network. Anything not in **Verified** is
kept as `status: "unverified"` (value `null`) in `config/chains.ts` and must not be used.

## Verified — Robinhood Chain

| Property                  | Mainnet                                                       | Testnet                                      |
| ------------------------- | ------------------------------------------------------------- | -------------------------------------------- |
| Chain ID                  | `4663`                                                        | `46630`                                      |
| Gas token                 | ETH                                                           | ETH                                          |
| Public RPC (rate-limited) | `https://rpc.mainnet.chain.robinhood.com`                     | `https://rpc.testnet.chain.robinhood.com`    |
| Explorer                  | https://robinhoodchain.blockscout.com                         | https://explorer.testnet.chain.robinhood.com |
| Stack                     | Arbitrum-based Ethereum L2                                    | same                                         |
| Settles to                | Ethereum                                                      | —                                            |
| Canonical bridge          | Arbitrum canonical bridge, ~7-day withdrawal challenge period | —                                            |

Secondary chains (Ethereum, Arbitrum, Base, Optimism) use viem's maintained chain definitions,
including their Multicall3 addresses.

## Unverified — Robinhood Chain

- Multicall3 deployment (check bytecode at `0xcA11bde05977b3631167028862bE2a173976CA11` on the explorer)
- Canonical bridge contracts: Inbox, Outbox, Rollup (and the parent-chain side on Ethereum)
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
