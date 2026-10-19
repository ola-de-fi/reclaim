import type { Metadata } from "next";
import { DocPage, DocSection } from "@/components/doc-page";

export const metadata: Metadata = {
  title: "Terms & privacy",
  description: "Terms of use and privacy notice for Reclaim.",
};

export default function TermsPage() {
  return (
    <DocPage
      kicker="Terms & privacy · Last updated 19 October 2026"
      title="Terms & privacy"
      intro={<p>Plain-language terms for using Reclaim. By using the site you agree to them.</p>}
    >
      <DocSection title="The service">
        <p>
          Reclaim reads public blockchain data to show funds that may be recoverable from Robinhood
          Chain&apos;s bridge, and can prepare transactions for the official bridge contracts for
          you to review and sign in your own wallet. Reclaim is non-custodial: it never holds,
          controls or moves your funds, and cannot reverse transactions.
        </p>
      </DocSection>

      <DocSection title="Your responsibility">
        <p>
          You decide whether to sign any transaction, and you pay its network fee. Always read the
          review screen and your wallet&apos;s prompt before signing. Amounts and dollar values
          shown are estimates from public data and price feeds and may be wrong or out of date.
        </p>
        <p>
          Do not use Reclaim for anything unlawful, or to interfere with the service or other
          people&apos;s funds.
        </p>
      </DocSection>

      <DocSection title="No warranty">
        <p>
          Reclaim is provided &quot;as is&quot;, without warranties of any kind. Blockchains,
          bridges, wallets and third-party services can fail. To the fullest extent permitted by
          law, the operator is not liable for any loss arising from use of the site, including lost
          funds, failed transactions or network fees. Nothing on the site is financial advice.
        </p>
      </DocSection>

      <DocSection title="Privacy">
        <p>
          Reclaim has no accounts and does not ask for personal information. Wallet addresses you
          scan are sent to our server only to run the scan; they are not stored or logged, apart
          from short-lived in-memory caching (about a minute) and rate limiting by IP address.
        </p>
        <p>
          Scans query public blockchain RPC providers, and the site is hosted on Vercel, which
          processes standard request data (such as IP addresses) to serve the site. If you connect a
          wallet, the connection happens in your browser through your wallet provider.
        </p>
      </DocSection>

      <DocSection title="Changes">
        <p>
          These terms may change as Reclaim develops. The date at the top shows the latest version.
        </p>
      </DocSection>
    </DocPage>
  );
}
