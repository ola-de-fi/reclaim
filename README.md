# Reclaim

Find and recover forgotten crypto on Robinhood Chain.

Reclaim scans a wallet address for funds that are stuck or unclaimed: pending bridge withdrawals,
unclaimed rewards and airdrops, forgotten DeFi deposits. Then it helps you recover them. It is
non-custodial: Reclaim never holds funds, never asks for approvals to its own contracts, and every
transaction is signed by you.

**Status:** working scanner with live streaming results and 1-click claim. Detectors:

- Robinhood Chain canonical bridge withdrawals (pending and claimable)
- Token balances
- Failed deposits

Deploying: see [docs/deploy.md](docs/deploy.md).

## Getting started

Requires Node 20+ and pnpm.

```bash
pnpm install
cp .env.example .env.local   # optional: add private RPC URLs
pnpm dev                     # http://localhost:3000
```

## Scripts

| Command          | What it does         |
| ---------------- | -------------------- |
| `pnpm dev`       | Start the dev server |
| `pnpm build`     | Production build     |
| `pnpm lint`      | ESLint               |
| `pnpm typecheck` | TypeScript, no emit  |
| `pnpm test`      | Vitest               |
| `pnpm format`    | Prettier             |

## Layout

```
app/              Next.js App Router pages and /api/scan
config/chains.ts  Typed chain config (verified vs unverified values)
lib/scanner/      Scanner engine, RPC clients and detector adapters
lib/providers/    Client providers (wagmi + RainbowKit wallet connect)
docs/             Chain facts and research notes
tests/            Vitest tests
```

## RPCs

Robinhood Chain's public RPCs are rate-limited. Set `RPC_URL_*` in `.env.local` to use private
endpoints; they are read server-side only and never shipped to the browser.

See [docs/chain-facts.md](docs/chain-facts.md) for what is verified and what still needs checking.
