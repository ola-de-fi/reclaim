"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ClaimDialog } from "@/components/claim-dialog";
import { ShareButton } from "@/components/share-button";
import { getChainById } from "@/config/chains";
import { useScan } from "@/lib/scanner/use-scan";
import type { ClaimablePosition } from "@/lib/scanner/types";
import { ClaimTicket } from "@/components/scan/claim-ticket";
import { DepartureBoard } from "@/components/scan/departure-board";
import { SearchLog } from "@/components/scan/search-log";
import { WalletTable } from "@/components/scan/wallet-table";
import { ClaimContext, focusRing, short, usd } from "@/components/scan/shared";

export function ScanView({ address }: { address: string }) {
  const scan = useScan(address);
  const [claiming, setClaiming] = useState<ClaimablePosition | null>(null);
  const [claimed, setClaimed] = useState<Set<string>>(() => new Set());
  const markClaimed = useCallback((id: string) => setClaimed((s) => new Set(s).add(id)), []);
  const { summary, positions, phase } = scan;
  const recoverable = positions.filter((p) => p.kind !== "wallet_asset");
  const claimable = positions.filter((p) => p.kind === "claimable");
  const pending = positions.filter((p) => p.kind === "pending");
  const walletAssets = positions.filter((p) => p.kind === "wallet_asset");
  const categories = Object.entries(summary.byCategory).sort((a, b) => b[1] - a[1]);
  const found = summary.claimableUsd + summary.pendingUsd;
  const chains = [...new Set(positions.map((p) => p.chainId))]
    .map((id) => getChainById(id)?.name ?? String(id))
    .join(" · ");
  const running = phase === "connecting" || phase === "scanning";

  return (
    <ClaimContext.Provider value={{ open: setClaiming, claimed }}>
      <div className="flex flex-col gap-8">
        <header className="grid gap-4 border-b-[1.5px] border-ink pb-6 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="min-w-0">
            <p className="font-mono text-[11px] tracking-[0.14em] text-ink-2 uppercase">
              Enquiry · {phase === "done" ? "Closed" : phase === "error" ? "Interrupted" : "Open"}
            </p>
            <h1
              className="mt-2 font-serif text-4xl leading-[0.98] tracking-tight sm:text-6xl"
              aria-live="polite"
            >
              <Headline phase={phase} found={found} hasRecoverable={recoverable.length > 0} />
            </h1>
            <p className="mt-3 font-mono text-xs break-all text-ink-2">
              <span title={address}>{short(address)}</span>
              {chains && <> · {chains}</>}
              {scan.ms != null && <> · {(scan.ms / 1000).toFixed(1)}s</>}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 font-mono text-xs sm:justify-end">
            {phase === "done" && (
              <ShareButton
                claimableUsd={summary.claimableUsd}
                pendingUsd={summary.pendingUsd}
                count={recoverable.length}
                address={address}
              />
            )}
            <StatusMark phase={phase} />
          </div>
        </header>

        <div className="grid grid-cols-1 border-b border-rule sm:grid-cols-3">
          <Stat
            label="Ready now"
            value={summary.claimableUsd}
            tone="text-stamp-ink"
            note={
              claimable.length > 0
                ? `${claimable.length} item${claimable.length === 1 ? "" : "s"} ready to collect`
                : "Nothing ready yet"
            }
          />
          <Stat
            label="Pending"
            value={summary.pendingUsd}
            tone="text-transit"
            note={pending.length > 0 ? "Unlocks later" : "Nothing in transit"}
          />
          <Stat
            label="Already in wallet"
            value={summary.walletAssetUsd}
            tone="text-ink-3"
            note="Not counted as recovered"
          />
        </div>

        {categories.length > 0 && (
          <ul className="-mt-4 flex flex-wrap gap-x-5 gap-y-1 font-mono text-xs text-ink-2">
            {categories.map(([cat, value]) => (
              <li key={cat}>
                <span className="tracking-[0.1em] text-ink-3 uppercase">{cat}</span>{" "}
                <span className="text-ink tabular-nums">{usd(value)}</span>
              </li>
            ))}
          </ul>
        )}

        {phase === "error" && (
          <div role="alert" className="border-2 border-stamp bg-card px-4 py-4 sm:px-5">
            <p className="font-serif text-2xl">The search was interrupted.</p>
            <p className="mt-1 font-mono text-xs break-words text-ink-2">{scan.error}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className={`mt-3 border-2 border-ink bg-card px-3 py-2 font-mono text-xs font-semibold tracking-[0.12em] uppercase hover:bg-paper-2 ${focusRing}`}
            >
              Retry
            </button>
          </div>
        )}

        {claimable.length > 0 && (
          <section aria-labelledby="ready-h" className="flex flex-col gap-5">
            <div className="flex justify-between font-mono text-[11px] tracking-[0.12em] text-ink-2 uppercase">
              <h2 id="ready-h">Ready to collect</h2>
              <span>
                {claimable.length} ticket{claimable.length === 1 ? "" : "s"}
              </span>
            </div>
            {claimable.map((p, i) => (
              <ClaimTicket key={p.id} p={p} index={i} />
            ))}
          </section>
        )}

        {pending.length > 0 && <DepartureBoard positions={pending} />}

        {recoverable.length === 0 && phase !== "error" && (
          <p className="border border-dashed border-rule bg-card px-4 py-6 text-sm text-ink-2 sm:px-5">
            {phase === "done"
              ? `Nothing recoverable on file across ${scan.adapters.length} protocol${scan.adapters.length === 1 ? "" : "s"}. That is a good result: nothing of yours is stuck.`
              : "The clerks are still working through the shelves…"}
          </p>
        )}

        {walletAssets.length > 0 && <WalletTable positions={walletAssets} />}

        <SearchLog adapters={scan.adapters} log={scan.log} phase={phase} />
        {running && <span className="sr-only">Scan in progress</span>}
      </div>
      {claiming && (
        <ClaimDialog
          position={claiming}
          onClose={() => setClaiming(null)}
          onClaimed={markClaimed}
        />
      )}
    </ClaimContext.Provider>
  );
}

function Headline({
  phase,
  found,
  hasRecoverable,
}: {
  phase: string;
  found: number;
  hasRecoverable: boolean;
}) {
  if (phase === "error") return <>The search was interrupted.</>;
  if (phase !== "done") return <>Searching the register…</>;
  if (found > 0)
    return (
      <>
        We found <em className="text-stamp-ink">{usd(found)}</em> with your name on it.
      </>
    );
  if (hasRecoverable) return <>We found items with your name on them.</>;
  return <>Nothing unclaimed under this address.</>;
}

function StatusMark({ phase }: { phase: string }) {
  if (phase === "done") return <span className="stamp text-ink-2">Search complete</span>;
  if (phase === "error") return <span className="stamp text-stamp-ink">Failed</span>;
  return <span className="stamp text-transit">Searching</span>;
}

function Stat({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: number;
  note: string;
  tone: string;
}) {
  const shown = useCountUp(value);
  return (
    <div className="border-rule py-4 sm:border-r sm:px-6 sm:py-5 sm:first:pl-0 sm:last:border-r-0 [&+&]:border-t sm:[&+&]:border-t-0">
      <div className="font-mono text-[11px] tracking-[0.12em] text-ink-2 uppercase">{label}</div>
      <div
        className={`mt-1.5 font-mono text-3xl font-medium tracking-tight tabular-nums sm:text-4xl ${tone}`}
      >
        {usd(shown)}
      </div>
      <div className="mt-0.5 text-sm text-ink-3">{note}</div>
    </div>
  );
}

function useCountUp(target: number, ms = 600) {
  const [value, setValue] = useState(target);
  const current = useRef(target);
  useEffect(() => {
    const set = (v: number) => {
      current.current = v;
      setValue(v);
    };
    const from = current.current;
    if (from === target || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      set(target);
      return;
    }
    const start = performance.now();
    let raf = requestAnimationFrame(function tick(t) {
      const k = Math.min(1, (t - start) / ms);
      set(k === 1 ? target : from + (target - from) * (1 - (1 - k) ** 3));
      if (k < 1) raf = requestAnimationFrame(tick);
    });
    // rAF pauses in background tabs; make sure we always land on the exact value.
    const settle = setTimeout(() => set(target), ms + 50);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(settle);
    };
  }, [target, ms]);
  return value;
}
