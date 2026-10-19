import { AddressForm } from "@/components/address-form";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

const STEPS = [
  {
    n: "Step 01",
    title: "File an enquiry",
    body: "Paste any address. Reclaim reads Robinhood Chain and Ethereum. Nothing is signed, no wallet needed.",
  },
  {
    n: "Step 02",
    title: "Check the register",
    body: "Each item shows what it is, where it is stuck, and whether it can be collected today or has a deadline.",
  },
  {
    n: "Step 03",
    title: "Collect, in person",
    body: "Connect your wallet, review a simulated transaction, and sign it yourself. Funds go straight to you.",
  },
] as const;

const REGISTER = [
  {
    cat: "RC-W",
    title: "Unclaimed bridge withdrawals",
    body: "Robinhood Chain → Ethereum withdrawals never collected on Ethereum. Ready once the ~6.4-day challenge period ends; pending until then.",
    stamps: [
      { label: "Ready", tone: "text-stamp-ink" },
      { label: "Pending", tone: "text-transit" },
    ],
  },
  {
    cat: "RC-D",
    title: "Failed deposits",
    body: "Ethereum → Robinhood Chain deposits whose retryable ticket failed. They must be redeemed within 7 days or the funds are lost.",
    stamps: [{ label: "Redeem · 7d limit", tone: "text-stamp-ink" }],
  },
  {
    cat: "RC-B",
    title: "Wallet balances",
    body: "ETH, WETH, USDC, USDT, WBTC, LINK and UNI already in your wallet. Listed for the record, never counted as recovered.",
    stamps: [{ label: "In your wallet", tone: "text-ink-2" }],
  },
] as const;

const TRUST = [
  ["Non-custodial", "Reclaim never holds your funds."],
  ["Simulated first", "Every transaction is simulated before you sign."],
  ["No approvals", "Never asks for token allowances."],
  ["No fee", "You pay network gas only."],
  ["Read-only scan", "No wallet needed to look."],
] as const;

export default function Home() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl flex-col px-4 sm:px-6 lg:px-8">
      <SiteHeader showNav />

      <main className="flex flex-1 flex-col">
        <section className="grid items-start gap-10 py-12 sm:py-16 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16 lg:py-20">
          <div>
            <p className="mb-5 font-mono text-xs tracking-[0.14em] text-stamp-ink uppercase">
              No fee · Read-only scan
            </p>
            <h1 className="font-serif text-5xl leading-[0.95] tracking-tight text-balance text-ink sm:text-6xl lg:text-7xl">
              Money you <em className="text-stamp">left behind</em> is still waiting for you.
            </h1>
            <p className="mt-7 max-w-[34ch] text-lg text-pretty text-ink-2">
              Bridge withdrawals nobody collected. Deposits that failed halfway. Reclaim keeps the
              register of what is stuck on Robinhood Chain, and hands it back. You sign every
              transaction.
            </p>
          </div>
          <section
            aria-label="Scanner"
            className="border border-ink bg-card shadow-[6px_6px_0_var(--color-paper-2),6px_6px_0_1px_var(--color-rule)]"
          >
            <AddressForm />
          </section>
        </section>

        <section id="how" aria-labelledby="how-heading" className="scroll-mt-6 py-8">
          <h2
            id="how-heading"
            className="mb-6 font-serif text-4xl leading-none tracking-tight text-ink sm:text-5xl"
          >
            Three steps at the <em className="text-stamp">counter</em>.
          </h2>
          <ol className="grid border-y border-ink md:grid-cols-3">
            {STEPS.map((s) => (
              <li
                key={s.n}
                className="border-b border-rule py-6 last:border-b-0 md:border-r md:border-b-0 md:px-7 md:first:pl-0 md:last:border-r-0"
              >
                <p className="font-mono text-xs tracking-widest text-stamp-ink uppercase">{s.n}</p>
                <h3 className="my-2.5 font-serif text-3xl leading-tight text-ink">{s.title}</h3>
                <p className="max-w-[32ch] text-[15px] text-pretty text-ink-2">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section
          id="register"
          aria-labelledby="register-heading"
          className="grid scroll-mt-6 gap-6 py-12 lg:grid-cols-[240px_1fr] lg:gap-12"
        >
          <div>
            <h2
              id="register-heading"
              className="font-serif text-4xl leading-none tracking-tight text-ink"
            >
              The register.
            </h2>
            <p className="mt-3 text-[15px] text-ink-2">
              What Reclaim looks for, and how each item is filed.
            </p>
          </div>
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="font-mono text-[11px] tracking-widest text-ink-2 uppercase">
                <th
                  scope="col"
                  className="hidden border-b-[1.5px] border-ink pr-3 pb-2.5 font-medium sm:table-cell"
                >
                  Cat.
                </th>
                <th scope="col" className="border-b-[1.5px] border-ink pr-3 pb-2.5 font-medium">
                  Item
                </th>
                <th
                  scope="col"
                  className="border-b-[1.5px] border-ink pb-2.5 text-right font-medium"
                >
                  Filed as
                </th>
              </tr>
            </thead>
            <tbody>
              {REGISTER.map((r) => (
                <tr key={r.cat} className="border-b border-rule align-top">
                  <td className="hidden w-16 py-5 pr-3 font-mono text-[13px] text-ink-3 sm:table-cell">
                    {r.cat}
                  </td>
                  <td className="py-5 pr-3">
                    <h3 className="font-serif text-2xl leading-tight text-ink">{r.title}</h3>
                    <p className="mt-1 max-w-[46ch] text-sm text-pretty text-ink-2">{r.body}</p>
                  </td>
                  <td className="py-5 text-right sm:w-48">
                    <div className="flex flex-col items-end gap-4 pt-1">
                      {r.stamps.map((s) => (
                        <span key={s.label} className={`stamp text-center ${s.tone}`}>
                          {s.label}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section id="safety" aria-labelledby="safety-heading" className="scroll-mt-6 pb-16">
          <h2 id="safety-heading" className="sr-only">
            Safety
          </h2>
          <ul className="grid border border-ink bg-card sm:grid-cols-2 lg:grid-cols-5">
            {TRUST.map(([title, body]) => (
              <li
                key={title}
                className="border-b border-rule p-4 text-sm last:border-b-0 lg:border-r lg:border-b-0 lg:last:border-r-0"
              >
                <strong className="mb-1 block font-mono text-[11px] font-semibold tracking-widest text-ink uppercase">
                  {title}
                </strong>
                <span className="text-ink-2">{body}</span>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
