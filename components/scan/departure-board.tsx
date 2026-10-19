"use client";

import type { ClaimablePosition } from "@/lib/scanner/types";
import { Action, RiskMark, chainName, formatRemaining, useNow, usd } from "./shared";

const WEEK = 7 * 86_400;
const TICKS = ["Now", "+1d", "+2d", "+3d", "+4d", "+5d", "+6d", "+7d"];
const rail =
  "repeating-linear-gradient(90deg, transparent 0 calc(100% / 7 - 1px), var(--color-rule) calc(100% / 7 - 1px) calc(100% / 7))";

export function DepartureBoard({ positions }: { positions: ClaimablePosition[] }) {
  const now = useNow();
  const nowS = now === null ? null : Math.floor(now / 1000);
  const rows = [...positions].sort((a, b) => (a.readyAt ?? Infinity) - (b.readyAt ?? Infinity));
  const nextId = rows.find((p) => p.readyAt != null)?.id;
  const total = rows.reduce((s, p) => s + (p.estimatedUsdValue ?? 0), 0);

  return (
    <section aria-labelledby="dep-h" className="border border-ink bg-card">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b-2 border-ink px-4 py-3 sm:px-5">
        <h2 id="dep-h" className="font-mono text-xs tracking-[0.12em] text-transit uppercase">
          In transit · {rows.length} withdrawal{rows.length === 1 ? "" : "s"}
        </h2>
        <span className="font-mono text-lg font-medium text-transit tabular-nums">
          {usd(total)}
        </span>
      </header>
      <div
        aria-hidden
        className="hidden grid-cols-[6rem_9rem_1fr_7.5rem] border-b border-rule px-5 py-2 font-mono text-[10.5px] tracking-[0.12em] text-ink-3 uppercase md:grid"
      >
        <span>Unlocks in</span>
        <span>Item</span>
        <span className="flex justify-between pr-4">
          {TICKS.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </span>
        <span className="text-right">Value</span>
      </div>
      <ul>
        {rows.map((p) => {
          const left =
            p.readyAt != null && nowS !== null
              ? Math.min(100, Math.max(0, ((p.readyAt - nowS) / WEEK) * 100))
              : null;
          const isNext = p.id === nextId;
          const eta =
            p.readyAt == null ? "—" : nowS === null ? "…" : formatRemaining(p.readyAt - nowS);
          return (
            <li
              key={p.id}
              className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-x-3 gap-y-2 border-b border-dashed border-rule px-4 py-3 last:border-b-0 md:grid-cols-[6rem_9rem_1fr_7.5rem] md:gap-x-0 md:px-5"
            >
              <span
                className={`font-mono text-lg font-semibold tracking-tight tabular-nums md:text-xl ${isNext ? "text-stamp-ink" : "text-transit"}`}
              >
                {eta}
              </span>
              <span className="min-w-0 font-mono text-xs text-ink-2">
                <b className="block truncate font-sans text-sm font-semibold text-ink">
                  <span className="md:hidden">{shortRoute(p.protocol)}</span>
                  <span className="hidden md:inline">{p.protocol}</span>
                </b>
                <span className="break-all">
                  {p.amountFormatted} {p.asset.symbol}
                </span>
                <RiskMark p={p} />
                <span className="block text-ink-3">
                  <span className="hidden md:inline">{chainName(p.chainId)} · </span>#
                  {p.id.split(":").pop()}
                </span>
              </span>
              <div
                className="relative col-span-3 row-start-2 h-6 md:col-span-1 md:row-start-auto md:mr-4 md:h-12"
                style={{ backgroundImage: rail }}
                role="img"
                aria-label={
                  left === null
                    ? "Unlock time unknown"
                    : `Unlocks ${eta === "ready" ? "now" : `in ${eta}`}${left >= 100 ? ", beyond 7 days" : ""}`
                }
              >
                <span className="absolute inset-y-0 left-0 w-0.5 bg-stamp" />
                {left !== null && (
                  <>
                    <span
                      className="absolute top-1/2 left-0 h-0.5 -translate-y-1/2 bg-ink"
                      style={{ width: `${left}%` }}
                    />
                    <span
                      className={`absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 md:size-4 ${isNext ? "bg-stamp" : "bg-transit"}`}
                      style={{ left: `${left}%` }}
                    />
                  </>
                )}
              </div>
              <span className="text-right font-mono">
                <span className="block text-base font-medium tabular-nums">
                  {p.estimatedUsdValue === null ? "No price" : usd(p.estimatedUsdValue)}
                </span>
                {isNext && <small className="block text-[11px] text-stamp-ink">next</small>}
                <span className="mt-1 inline-block">
                  <Action p={p} />
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="border-t border-ink px-4 py-2 font-mono text-[11px] text-ink-2 sm:px-5">
        Each becomes ready to collect when its waiting period ends. Track runs 7 days from now.
      </p>
    </section>
  );
}

/** "Robinhood Chain → Ethereum" → "→ Ethereum" for narrow screens. */
function shortRoute(protocol: string): string {
  const to = protocol.split("→")[1]?.trim();
  return to ? `→ ${to}` : protocol;
}
