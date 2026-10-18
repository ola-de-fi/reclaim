"use client";

import type { ClaimablePosition } from "@/lib/scanner/types";
import { Action, CATEGORY_LABEL, RiskMark, chainName, itemNo, netAfterGas, usd } from "./shared";

function windowLabel(p: ClaimablePosition) {
  if (p.claimAction.type === "direct") return "Ready now";
  if (p.claimAction.type === "external") return "Claim in app";
  if (p.claimAction.type === "multi_step") return "Multi-step";
  return "Manual";
}

export function ClaimTicket({ p, index }: { p: ClaimablePosition; index: number }) {
  const net = netAfterGas(p);
  return (
    <article
      aria-label={`${p.protocol}, ${p.amountFormatted} ${p.asset.symbol}`}
      className="relative grid border border-ink bg-card sm:grid-cols-[1fr_11rem]"
    >
      <div className="min-w-0 px-5 py-5 sm:px-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="font-mono text-xs tracking-[0.08em] text-ink-3">
              ITEM {itemNo(index)} · {p.adapterId.toUpperCase()}
            </div>
            <h3 className="mt-1.5 font-serif text-2xl leading-tight break-words sm:text-[28px]">
              {p.protocol}
              <span className="px-1.5 font-mono text-base text-ink-3" aria-hidden>
                ·
              </span>
              <span className="text-ink-2">{chainName(p.chainId)}</span>
            </h3>
          </div>
          <span className="stamp shrink-0 text-stamp-ink">Claimable</span>
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-[auto_auto_auto] sm:justify-start">
          <div className="col-span-2 min-w-0 sm:col-span-1">
            <dt className="font-mono text-[10.5px] tracking-[0.12em] text-ink-3 uppercase">
              Amount
            </dt>
            <dd className="font-mono text-[15px] font-medium break-all tabular-nums">
              {p.amountFormatted} {p.asset.symbol}
              <RiskMark p={p} />
            </dd>
          </div>
          <div>
            <dt className="font-mono text-[10.5px] tracking-[0.12em] text-ink-3 uppercase">Type</dt>
            <dd className="font-mono text-[15px] font-medium">{CATEGORY_LABEL[p.category]}</dd>
          </div>
          <div>
            <dt className="font-mono text-[10.5px] tracking-[0.12em] text-ink-3 uppercase">
              Window
            </dt>
            <dd className="font-mono text-[15px] font-medium">{windowLabel(p)}</dd>
          </div>
        </dl>
        {!p.risk.verified && p.risk.notes && (
          <p className="mt-3 text-sm text-ink-2">
            <span className="font-mono text-xs text-stamp-ink">UNVERIFIED · </span>
            {p.risk.notes}
          </p>
        )}
      </div>

      {/* Tear line: horizontal on mobile, vertical perforation on desktop. */}
      <div aria-hidden className="border-t-2 border-dashed border-ink-3 sm:hidden" />
      <div className="flex flex-col justify-between gap-4 bg-paper-2 px-5 py-5 sm:border-l-2 sm:border-dashed sm:border-ink-3 sm:px-4">
        <div className="font-mono">
          {p.estimatedUsdValue === null ? (
            <div className="text-lg text-ink-2">No price</div>
          ) : (
            <>
              <div
                className={`text-2xl font-medium tracking-tight tabular-nums ${net !== null && net <= 0 ? "text-stamp-ink" : ""}`}
              >
                {usd(net ?? p.estimatedUsdValue)}
              </div>
              <div className="text-[11px] text-ink-2">
                {net !== null
                  ? net > 0
                    ? `net after gas · ${usd(p.estimatedUsdValue)} gross`
                    : `gas exceeds value (${usd(p.estimatedUsdValue)})`
                  : "amount from scan"}
              </div>
            </>
          )}
        </div>
        <Action p={p} block />
      </div>
    </article>
  );
}
