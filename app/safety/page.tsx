import type { Metadata } from "next";
import { DocPage, DocSection } from "@/components/doc-page";
import { CHAINS } from "@/config/chains";
import { X_URL } from "@/components/site-footer";

export const metadata: Metadata = {
  title: "Safety",
  description:
    "What Reclaim does and never does: read-only scans, no seed phrases, no token approvals, only official bridge contracts, every transaction simulated before you sign.",
};

const bridge = CHAINS.robinhood.contracts.canonicalBridge;
const ETHERSCAN = CHAINS.ethereum.explorer.url;
const REPO_URL = process.env.NEXT_PUBLIC_REPO_URL ?? "https://github.com/ola-de-fi/reclaim";

const contracts: Array<{ name: string; address: string | null; where: string; what: string }> = [
  {
    name: "Robinhood Chain Outbox",
    address: bridge.outbox.value,
    where: "Ethereum",
    what: "executeTransaction: finalizes a Robinhood Chain → Ethereum withdrawal. Funds go to the address the withdrawal was originally sent to.",
  },
  {
    name: "ArbRetryableTx (system contract)",
    address: "0x000000000000000000000000000000000000006E",
    where: "Robinhood Chain",
    what: "redeem: re-runs a deposit that failed on arrival, so it completes to its original destination.",
  },
];

export default function SafetyPage() {
  return (
    <DocPage
      kicker="Safety"
      title={
        <>
          What Reclaim will <em className="text-stamp-ink">never</em> ask you for.
        </>
      }
      intro={
        <p>
          Scam sites that promise to recover crypto usually want your seed phrase or a token
          approval. Reclaim needs neither. Here is exactly what it does, so you can check it
          yourself.
        </p>
      }
    >
      <DocSection title="Never">
        <ul className="grid gap-2 sm:grid-cols-2">
          {[
            "Your seed phrase or private key",
            "Token approvals or permits",
            "Transfers of your tokens or NFTs",
            "Passwords, emails or personal details",
            "Payment or a fee",
            "Signatures for anything other than the transaction shown",
          ].map((item) => (
            <li key={item} className="flex gap-2.5">
              <span aria-hidden className="font-mono text-stamp-ink">
                ✕
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <p>If any site using the Reclaim name asks for these, it is not us. Close it.</p>
      </DocSection>

      <DocSection title="How a scan works">
        <p>
          You paste a public wallet address. Reclaim reads public blockchain data for that address:
          Robinhood Chain withdrawals that were never finalized on Ethereum, deposits that failed on
          arrival, and token balances. <strong>No wallet connection is needed</strong>, nothing is
          signed, and addresses are not stored.
        </p>
      </DocSection>

      <DocSection title="How collecting works">
        <p>
          Only if you choose to collect something do you connect a wallet. Before your wallet opens,
          Reclaim:
        </p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            Checks the transaction calls one of the official bridge contracts below, and nothing
            else. Anything else is blocked.
          </li>
          <li>Decodes the transaction to show what it really does and where the funds go.</li>
          <li>Simulates it on-chain, and again right before you sign.</li>
        </ol>
        <p>
          The transaction never sends any of your funds, so the only cost is the network fee. These
          bridge functions are permissionless: they pay out to the original owner no matter who
          submits them.
        </p>
      </DocSection>

      <DocSection title="The only contracts Reclaim calls">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-ink text-left font-mono text-[11px] tracking-[0.12em] text-ink-3 uppercase">
                <th className="py-2 pr-4 font-normal">Contract</th>
                <th className="py-2 pr-4 font-normal">Network</th>
                <th className="py-2 font-normal">What it does</th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((c) => (
                <tr key={c.name} className="border-b border-rule align-top">
                  <td className="py-3 pr-4">
                    <div className="text-ink">{c.name}</div>
                    {c.address && (
                      <a
                        className="font-mono text-xs break-all"
                        href={
                          c.where === "Ethereum"
                            ? `${ETHERSCAN}/address/${c.address}`
                            : `${CHAINS.robinhood.explorer.url}/address/${c.address}`
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {c.address}
                      </a>
                    )}
                  </td>
                  <td className="py-3 pr-4">{c.where}</td>
                  <td className="py-3">{c.what}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Addresses match Robinhood&apos;s{" "}
          <a
            href="https://docs.robinhood.com/chain/protocol-contracts"
            target="_blank"
            rel="noopener noreferrer"
          >
            published protocol contracts
          </a>{" "}
          and were cross-checked on-chain.
        </p>
      </DocSection>

      <DocSection title="Report a problem">
        <p>
          Found a bug, or something that looks wrong? Please tell us before using it. Reports about
          lookalike sites are especially welcome.
        </p>
        <p>
          Message{" "}
          <a href={X_URL} target="_blank" rel="noopener noreferrer">
            @oladefi on X
          </a>{" "}
          or open an issue on{" "}
          <a href={`${REPO_URL}/issues`} target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
          . Reclaim&apos;s full source code is public there, so you can check everything on this
          page yourself.
        </p>
      </DocSection>
    </DocPage>
  );
}
