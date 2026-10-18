"use client";

import type { ClaimablePosition } from "@/lib/scanner/types";
import { Action, RiskMark, chainName, usd } from "./shared";

export function WalletTable({ positions }: { positions: ClaimablePosition[] }) {
  return (
    <section aria-labelledby="wallet-h" className="border border-rule bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-rule px-4 py-2.5 sm:px-5">
        <h2 id="wallet-h" className="font-mono text-[11px] tracking-[0.12em] text-ink-2 uppercase">
          For the record
        </h2>
        <span className="stamp text-ink-3">In your wallet</span>
      </div>
      <ul className="font-mono text-xs">
        {positions.map((p) => (
          <li
            key={p.id}
            className="grid grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-0.5 border-b border-dotted border-rule px-4 py-2.5 last:border-b-0 sm:grid-cols-[1fr_10rem_7rem_auto] sm:px-5"
          >
            <span className="min-w-0 truncate text-ink">
              {p.protocol} <span className="text-ink-3">· {chainName(p.chainId)}</span>
            </span>
            <span className="text-right text-ink-2 tabular-nums sm:order-none">
              {p.estimatedUsdValue === null ? "no price" : usd(p.estimatedUsdValue)}
            </span>
            <span className="break-all text-ink-2 tabular-nums sm:text-right">
              {p.amountFormatted} {p.asset.symbol}
              <RiskMark p={p} />
            </span>
            <span className="text-right">
              <Action p={p} />
            </span>
          </li>
        ))}
      </ul>
      <p className="border-t border-rule px-4 py-2 text-xs text-ink-3 sm:px-5">
        Already yours. Not counted as recovered.
      </p>
    </section>
  );
}
