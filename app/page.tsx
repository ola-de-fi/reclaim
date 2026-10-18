import { AddressForm } from "@/components/address-form";
import { SiteHeader } from "@/components/site-header";

const FINDS = [
  {
    label: "bridge · claimable",
    title: "Unclaimed bridge withdrawals",
    body: "Robinhood Chain → Ethereum withdrawals that were never claimed on Ethereum. Shown as claimable, or pending while the ~6.4-day challenge period runs.",
  },
  {
    label: "deposit · expires 7d",
    title: "Failed deposits",
    body: "Ethereum → Robinhood Chain deposits whose retryable ticket failed. They must be redeemed within 7 days or the funds are lost.",
  },
  {
    label: "wallet · not counted",
    title: "Token balances",
    body: "ETH and bridged WETH, USDC, USDT, WBTC, LINK and UNI. Shown for context, never counted as recovered.",
  },
] as const;

const STEPS = [
  { n: "01", title: "Scan", body: "Paste an address. Read-only, no wallet needed." },
  { n: "02", title: "Review", body: "See each item, its status and any deadline." },
  { n: "03", title: "Claim", body: "Connect a wallet and sign. Every claim is simulated first." },
] as const;

const TRUST = ["Non-custodial", "Simulated before you sign", "No approvals", "No fee"] as const;

export default function Home() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col px-4 sm:px-6">
      <SiteHeader />

      <main className="flex flex-1 flex-col gap-12 py-14 sm:py-20">
        <section className="space-y-4">
          <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Find and recover forgotten crypto on Robinhood Chain.
          </h1>
          <p className="max-w-xl text-pretty text-zinc-400">
            Paste a wallet address to find unclaimed bridge withdrawals and failed deposits. Then
            recover them yourself. You sign every transaction.
          </p>
        </section>

        <section aria-label="Scanner" className="rounded-lg border border-zinc-800 bg-zinc-900">
          <AddressForm />
        </section>

        <ul
          aria-label="Guarantees"
          className="flex flex-wrap gap-x-4 gap-y-2 font-mono text-xs text-zinc-400"
        >
          {TRUST.map((t) => (
            <li key={t} className="flex items-center gap-2">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-accent" />
              {t}
            </li>
          ))}
        </ul>

        <section aria-labelledby="finds-heading" className="space-y-4">
          <h2 id="finds-heading" className="text-lg font-semibold tracking-tight">
            What Reclaim finds
          </h2>
          <ul className="divide-y divide-zinc-800 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900">
            {FINDS.map((f) => (
              <li key={f.label} className="space-y-1.5 p-4">
                <p className="font-mono text-xs text-accent">{f.label}</p>
                <h3 className="font-medium text-zinc-100">{f.title}</h3>
                <p className="text-sm text-pretty text-zinc-400">{f.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="how-heading" className="space-y-4">
          <h2 id="how-heading" className="text-lg font-semibold tracking-tight">
            How it works
          </h2>
          <ol className="grid gap-3 sm:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="space-y-1.5 rounded-lg border border-zinc-800 p-4">
                <p className="font-mono text-xs text-zinc-500">{s.n}</p>
                <h3 className="font-medium text-zinc-100">{s.title}</h3>
                <p className="text-sm text-pretty text-zinc-400">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <footer className="border-t border-zinc-800 py-4 font-mono text-xs text-zinc-500">
        Reclaim never holds your funds or asks for token approvals.
      </footer>
    </div>
  );
}
