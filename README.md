# Reclaim

Find and recover forgotten crypto on Robinhood Chain.

Reclaim scans a wallet address for funds that are stuck or unclaimed: pending bridge withdrawals,
unclaimed rewards and airdrops, forgotten DeFi deposits. Then it helps you recover them. It is
non-custodial: Reclaim never holds funds, never asks for approvals to its own contracts, and every
transaction is signed by you.

**Status:** Phase 0 (project foundation). No scanning or claiming yet.

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
app/              Next.js App Router pages
config/chains.ts  Typed chain config (verified vs unverified values)
lib/scanner/      Scanner types (engine + adapters come in Phase 1)
lib/providers/    Client providers (wagmi; wallet connect comes in Phase 4)
docs/             Chain facts and research notes
tests/            Vitest tests
```

## RPCs

Robinhood Chain's public RPCs are rate-limited. Set `RPC_URL_*` in `.env.local` to use private
endpoints; they are read server-side only and never shipped to the browser.

See [docs/chain-facts.md](docs/chain-facts.md) for what is verified and what still needs checking.
