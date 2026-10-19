import type { Metadata } from "next";
import Link from "next/link";
import { DocPage, DocSection } from "@/components/doc-page";
import { REPO_URL, X_URL } from "@/components/site-footer";

export const metadata: Metadata = {
  title: "About",
  description:
    "Reclaim is an independent, non-custodial tool that finds funds stuck in Robinhood Chain's bridge and helps their owners recover them.",
};

export default function AboutPage() {
  return (
    <DocPage
      kicker="About"
      title={
        <>
          A lost-property office for <em className="text-stamp-ink">money</em>.
        </>
      }
      intro={
        <p>
          Reclaim is an independent tool for Robinhood Chain. It finds funds that got stuck halfway
          through the official bridge and walks their owners through getting them back.
        </p>
      }
    >
      <DocSection title="Why this exists">
        <p>
          Moving funds from Robinhood Chain to Ethereum takes two steps: you start the withdrawal,
          wait out a ~6.4-day challenge period, then finalize it on Ethereum. Many people never do
          the second step, and the funds sit waiting.
        </p>
        <p>
          Deposits in the other direction can also fail on arrival (for example if gas spikes).
          Those can be retried for 7 days, after which they are lost.
        </p>
        <p>Reclaim checks for both, and shows your token balances for context.</p>
      </DocSection>

      <DocSection title="What it is not">
        <p>
          Reclaim is not a wallet, an exchange or an airdrop. It never holds funds, charges no fee,
          and is not affiliated with or endorsed by Robinhood. Robinhood Chain is Robinhood&apos;s
          Ethereum layer-2 network; Reclaim only reads its public data and calls its official bridge
          contracts.
        </p>
        <p>
          See <Link href="/safety">Safety</Link> for exactly what Reclaim does and never does.
        </p>
      </DocSection>

      <DocSection title="Who runs it">
        <p>
          Reclaim is built and run by an independent developer,{" "}
          <a href={X_URL} target="_blank" rel="noopener noreferrer">
            @oladefi on X
          </a>
          . The full source code is{" "}
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
            public on GitHub
          </a>
          . It is early software: always read the review screen before you sign anything.
        </p>
      </DocSection>
    </DocPage>
  );
}
