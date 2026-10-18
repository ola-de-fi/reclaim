import { ALL_CHAINS } from "@/config/chains";
import { AddressForm } from "@/components/address-form";
import { SiteHeader } from "@/components/site-header";

export default function Home() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col px-4 sm:px-6">
      <SiteHeader />

      <main className="flex flex-1 flex-col gap-10 py-14 sm:py-20">
        <section className="space-y-4">
          <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Find and recover forgotten crypto on Robinhood Chain.
          </h1>
          <p className="max-w-xl text-zinc-400 text-pretty">
            Paste a wallet address to find pending bridge withdrawals, unclaimed rewards and
            airdrops, and forgotten deposits. Then recover them. Non-custodial: you sign every
            transaction.
          </p>
        </section>

        <section aria-label="Scanner" className="rounded-lg border border-zinc-800 bg-zinc-900">
          <AddressForm />
        </section>

        <section
          aria-label="Networks"
          className="overflow-hidden rounded-lg border border-zinc-800"
        >
          <table className="w-full font-mono text-xs">
            <thead className="bg-zinc-900 text-left text-zinc-500">
              <tr>
                <th className="px-4 py-2 font-normal">Network</th>
                <th className="px-4 py-2 font-normal">Chain ID</th>
                <th className="hidden px-4 py-2 font-normal sm:table-cell">Mode</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {ALL_CHAINS.map((chain) => (
                <tr key={chain.key} className="text-zinc-300">
                  <td className="px-4 py-2">
                    {chain.name}
                    {chain.role === "primary" && <span className="ml-2 text-accent">primary</span>}
                  </td>
                  <td className="px-4 py-2 tabular-nums text-zinc-400">{chain.id}</td>
                  <td className="hidden px-4 py-2 text-zinc-500 sm:table-cell">{chain.mode}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>

      <footer className="border-t border-zinc-800 py-4 font-mono text-xs text-zinc-600">
        Reclaim never holds your funds or asks for token approvals.
      </footer>
    </div>
  );
}
