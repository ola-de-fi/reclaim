# Deploying to Vercel

Reclaim is a standard Next.js 15 App Router app. No `vercel.json` is needed: the scan route sets
its own `runtime = "nodejs"` and `maxDuration = 60`.

## 1. Import the project

1. In Vercel, **Add New → Project** and import the Git repository.
2. Framework preset: **Next.js** (auto-detected). Leave build/output settings at their defaults.
3. Package manager: pnpm is detected from `pnpm-lock.yaml`. `package.json` pins
   `packageManager: pnpm@12.14.0`; to make Vercel use exactly that version, add the env var
   `ENABLE_EXPERIMENTAL_COREPACK=1`. Otherwise Vercel picks a pnpm version from the lockfile
   (v9 format), which also works.
4. Node.js version: **22.x** or **24.x** (Project Settings → General). `engines.node` is `>=20.9`.
   The server RPC client forces HTTP/1.1 through an undici Agent because Node 26's HTTP/2 fetch
   froze under concurrent requests; Vercel's Node 22/24 runtimes are fine either way.

## 2. Environment variables

Set these under Project Settings → Environment Variables (Production, and Preview if wanted).

| Variable                               | Required    | Notes                                                                                    |
| -------------------------------------- | ----------- | ---------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL`                 | Yes         | Production URL, e.g. `https://reclaim.example.com`. Used for `metadataBase` / OG links.  |
| `RPC_URL_ROBINHOOD_MAINNET`            | Recommended | Private RPC (Alchemy is Robinhood's recommended provider). Public RPC rate-limits.       |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Recommended | From [cloud.reown.com](https://cloud.reown.com). Without it only extension wallets work. |
| `RPC_URL_ROBINHOOD_TESTNET`            | Optional    | Server-only override.                                                                    |
| `RPC_URL_ETHEREUM`                     | Optional    | Server-only override (used for bridge-related lookups).                                  |
| `RPC_URL_ARBITRUM`                     | Optional    | Server-only override.                                                                    |
| `RPC_URL_BASE`                         | Optional    | Server-only override.                                                                    |
| `RPC_URL_OPTIMISM`                     | Optional    | Server-only override.                                                                    |
| `INDEXER_API_KEY`                      | No          | Not used yet.                                                                            |
| `SCANNER_MOCK`                         | Never       | Dev only. Must be unset in production (it returns fake results).                         |

`NEXT_PUBLIC_*` values are inlined at build time: redeploy after changing them. In the Reown
dashboard, add the production domain to the project's allowed origins.

## 3. Deploy and smoke test

After the first production deploy:

1. Open the home page; it should render without console errors.
2. Scan `0x380c87712Bd7bF34F8645d5674aB065Ca249de79`. Results stream in over ~10-20s. Expect a
   claimable Robinhood Chain bridge withdrawal of about **0.2028 ETH** (unless it has since been
   claimed, in which case it should not appear as claimable).
3. Open `/api/og` and check the Open Graph image renders.
4. Connect a wallet (extension and, if configured, WalletConnect QR) to confirm the modal works.
5. Check Vercel function logs for `/api/scan` timeouts or RPC `429 Too Many Requests` errors.

## Pre-launch checklist

- [ ] **Rate limiting:** `lib/rate-limit.ts` is in memory, per serverless instance, so limits are
      not shared and reset on cold start. Move it to a shared store (e.g. Upstash Redis) before
      real traffic.
- [ ] **Private RPC:** the public Robinhood RPC returns "Too Many Requests" under load and caps
      `eth_getLogs` at 10M blocks. Set `RPC_URL_ROBINHOOD_MAINNET` (and Ethereum) to Alchemy or
      similar.
- [ ] **Function duration:** scans need up to 60s. Confirm your Vercel plan allows `maxDuration = 60`.
- [ ] **Monitoring:** enable Vercel Observability / log drains and alert on 5xx and slow scans.
- [ ] **Legal:** publish Terms of Service and a privacy note (non-custodial, addresses not logged).
- [ ] **Trademark:** no Robinhood branding in the product name, logo or domain. "On Robinhood
      Chain" descriptive use only.
- [ ] `SCANNER_MOCK` unset in Production.
