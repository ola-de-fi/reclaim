"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { ClaimDialog } from "@/components/claim-dialog";
import { ShareButton } from "@/components/share-button";
import { getChainById } from "@/config/chains";
import { useScan, type AdapterState } from "@/lib/scanner/use-scan";
import type { ClaimablePosition, PositionKind } from "@/lib/scanner/types";

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

const KIND_LABEL: Record<PositionKind, string> = {
  claimable: "Claimable",
  pending: "Pending",
  wallet_asset: "In wallet",
};

const ClaimContext = createContext<{ open: (p: ClaimablePosition) => void; claimed: Set<string> }>({
  open: () => {},
  claimed: new Set(),
});

export function ScanView({ address }: { address: string }) {
  const scan = useScan(address);
  const [claiming, setClaiming] = useState<ClaimablePosition | null>(null);
  const [claimed, setClaimed] = useState<Set<string>>(() => new Set());
  const markClaimed = useCallback((id: string) => setClaimed((s) => new Set(s).add(id)), []);
  const { summary, positions, phase } = scan;
  const recoverable = positions.filter((p) => p.kind !== "wallet_asset");
  const walletAssets = positions.filter((p) => p.kind === "wallet_asset");
  const categories = Object.entries(summary.byCategory).sort((a, b) => b[1] - a[1]);

  return (
    <ClaimContext.Provider value={{ open: setClaiming, claimed }}>
      <div className="flex flex-col gap-6">
        <section className="rounded-lg border border-zinc-800 bg-zinc-900">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 px-4 py-3 font-mono text-xs text-zinc-500">
            <span title={address}>{short(address)}</span>
            <span className="flex items-center gap-3">
              {phase === "done" && (
                <ShareButton
                  claimableUsd={summary.claimableUsd}
                  pendingUsd={summary.pendingUsd}
                  count={recoverable.length}
                  address={address}
                />
              )}
              <StatusPill phase={phase} ms={scan.ms} />
            </span>
          </div>
          <div className="grid gap-px bg-zinc-800 sm:grid-cols-3">
            <Stat label="Claimable now" value={summary.claimableUsd} accent />
            <Stat
              label="Pending"
              value={summary.pendingUsd}
              hint={positions.some((p) => p.kind === "pending") ? "unlocks later" : undefined}
            />
            <Stat
              label="Already in wallet"
              value={summary.walletAssetUsd}
              hint="not counted"
              muted
            />
          </div>
          {categories.length > 0 && (
            <div className="flex flex-wrap gap-2 border-t border-zinc-800 px-4 py-3">
              {categories.map(([cat, value]) => (
                <span
                  key={cat}
                  className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 font-mono text-xs text-zinc-400"
                >
                  {cat} <span className="text-zinc-200">{usd(value)}</span>
                </span>
              ))}
            </div>
          )}
        </section>

        {phase === "error" && (
          <div
            role="alert"
            className="rounded-lg border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-300"
          >
            {scan.error}{" "}
            <button onClick={() => window.location.reload()} className="underline">
              Retry
            </button>
          </div>
        )}

        <PositionsSection
          title="Recoverable"
          positions={recoverable}
          phase={phase}
          empty={`Nothing recoverable found across ${scan.adapters.length} protocol${scan.adapters.length === 1 ? "" : "s"}.`}
        />
        {walletAssets.length > 0 && (
          <PositionsSection title="Already in your wallet" positions={walletAssets} phase={phase} />
        )}

        <AdapterPanel adapters={scan.adapters} log={scan.log} phase={phase} />
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

function StatusPill({ phase, ms }: { phase: string; ms?: number }) {
  if (phase === "done")
    return <span className="text-zinc-400">done · {((ms ?? 0) / 1000).toFixed(1)}s</span>;
  if (phase === "error") return <span className="text-red-400">failed</span>;
  return (
    <span className="flex items-center gap-2 text-zinc-300">
      <span className="size-1.5 animate-pulse rounded-full bg-accent" aria-hidden />
      scanning
    </span>
  );
}

function Stat({
  label,
  value,
  hint,
  accent,
  muted,
}: {
  label: string;
  value: number;
  hint?: string;
  accent?: boolean;
  muted?: boolean;
}) {
  const shown = useCountUp(value);
  return (
    <div className="bg-zinc-900 px-4 py-4">
      <div className="text-xs text-zinc-500">
        {label}
        {hint && <span className="text-zinc-600"> · {hint}</span>}
      </div>
      <div
        className={`mt-1 font-mono text-2xl tabular-nums ${accent ? "text-accent" : muted ? "text-zinc-500" : "text-zinc-100"}`}
      >
        {usd(shown)}
      </div>
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

function PositionsSection({
  title,
  positions,
  phase,
  empty,
}: {
  title: string;
  positions: ClaimablePosition[];
  phase: string;
  empty?: string;
}) {
  return (
    <section aria-label={title} className="overflow-hidden rounded-lg border border-zinc-800">
      <h2 className="border-b border-zinc-800 bg-zinc-900 px-4 py-2 text-xs text-zinc-500">
        {title} <span className="font-mono text-zinc-600">({positions.length})</span>
      </h2>
      {positions.length === 0 ? (
        <p className="px-4 py-6 text-sm text-zinc-500">
          {phase === "done" ? empty : phase === "error" ? "—" : "Looking…"}
        </p>
      ) : (
        <>
          <table className="hidden w-full font-mono text-xs sm:table">
            <thead className="text-left text-zinc-600">
              <tr className="border-b border-zinc-800">
                <th className="px-4 py-2 font-normal">Protocol</th>
                <th className="px-4 py-2 font-normal">Asset</th>
                <th className="px-4 py-2 text-right font-normal">Amount</th>
                <th className="px-4 py-2 text-right font-normal">USD</th>
                <th className="px-4 py-2 font-normal">Status</th>
                <th className="px-4 py-2 font-normal">
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {positions.map((p) => (
                <tr key={p.id} className="text-zinc-300">
                  <td className="px-4 py-3">
                    <div>{p.protocol}</div>
                    <div className="text-zinc-600">
                      {getChainById(p.chainId)?.name ?? p.chainId}
                    </div>
                  </td>
                  <td className="px-4 py-3">{p.asset.symbol}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{p.amountFormatted}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <UsdCell p={p} />
                  </td>
                  <td className="px-4 py-3">
                    <KindBadge p={p} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Action p={p} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <ul className="divide-y divide-zinc-800 sm:hidden">
            {positions.map((p) => (
              <li key={p.id} className="flex flex-col gap-2 px-4 py-3 font-mono text-xs">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-zinc-200">{p.protocol}</div>
                    <div className="text-zinc-600">
                      {getChainById(p.chainId)?.name ?? p.chainId}
                    </div>
                  </div>
                  <div className="text-right text-zinc-200 tabular-nums">
                    <UsdCell p={p} />
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 text-zinc-400">
                  <span className="tabular-nums">
                    {p.amountFormatted} {p.asset.symbol}
                  </span>
                  <KindBadge p={p} />
                </div>
                <div>
                  <Action p={p} />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function UsdCell({ p }: { p: ClaimablePosition }) {
  if (p.estimatedUsdValue === null) return <span className="text-zinc-600">no price</span>;
  const net = p.estimatedGasUsd != null ? p.estimatedUsdValue - p.estimatedGasUsd : null;
  return (
    <span>
      {usd(p.estimatedUsdValue)}
      {net !== null && (
        <span className={`block text-[11px] ${net > 0 ? "text-zinc-500" : "text-red-400"}`}>
          net {usd(net)} after gas
        </span>
      )}
    </span>
  );
}

function KindBadge({ p }: { p: ClaimablePosition }) {
  const cls =
    p.kind === "claimable"
      ? "border-accent/40 text-accent"
      : p.kind === "pending"
        ? "border-zinc-700 text-zinc-300"
        : "border-zinc-800 text-zinc-500";
  return (
    <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 ${cls}`}>
      {KIND_LABEL[p.kind]}
      {p.kind === "pending" && p.readyAt && <Countdown readyAt={p.readyAt} />}
      {!p.risk.verified && (
        <span className="text-amber-400" title={p.risk.notes ?? "Unverified"}>
          !
        </span>
      )}
    </span>
  );
}

function Countdown({ readyAt }: { readyAt: number }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  if (now === null) return null;
  const s = Math.max(0, readyAt - Math.floor(now / 1000));
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  return (
    <span className="text-zinc-500">· {s === 0 ? "ready" : d > 0 ? `${d}d ${h}h` : `${h}h`}</span>
  );
}

function Action({ p }: { p: ClaimablePosition }) {
  const { open, claimed } = useContext(ClaimContext);
  const base = "inline-block rounded-md px-3 py-1.5 text-xs font-medium";
  if (claimed.has(p.id)) {
    return <span className={`${base} text-accent`}>✓ Claimed</span>;
  }
  if (p.kind === "claimable" && p.claimAction.type === "direct") {
    return (
      <button
        onClick={() => open(p)}
        className={`${base} bg-accent text-zinc-950 hover:brightness-110 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none`}
      >
        Claim
      </button>
    );
  }
  if (p.claimAction.type === "external") {
    return (
      <a
        href={p.claimAction.url}
        target="_blank"
        rel="noopener noreferrer"
        className={`${base} border border-zinc-700 text-zinc-200 hover:border-zinc-500`}
      >
        Open in app ↗
      </a>
    );
  }
  if (p.kind === "wallet_asset") return null;
  // Multi-step claims and claims without calldata are not supported yet.
  return (
    <button disabled className={`${base} cursor-not-allowed bg-zinc-800 text-zinc-500`}>
      {p.kind === "pending" ? "Not ready" : "Claim · soon"}
    </button>
  );
}

function AdapterPanel({
  adapters,
  log,
  phase,
}: {
  adapters: AdapterState[];
  log: string[];
  phase: string;
}) {
  return (
    <section
      aria-label="Scan progress"
      className="overflow-hidden rounded-lg border border-zinc-800"
    >
      <h2 className="border-b border-zinc-800 bg-zinc-900 px-4 py-2 text-xs text-zinc-500">
        Protocols scanned
      </h2>
      {adapters.length === 0 ? (
        <p className="px-4 py-4 font-mono text-xs text-zinc-500">
          {phase === "done"
            ? "No protocol adapters enabled yet. Set SCANNER_MOCK=1 in .env.local to preview."
            : phase === "error"
              ? "—"
              : "Connecting…"}
        </p>
      ) : (
        <ul className="divide-y divide-zinc-800 font-mono text-xs">
          {adapters.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-2">
              <span className="flex min-w-0 items-center gap-2 text-zinc-300">
                <Dot status={a.status} />
                <span className="truncate">{a.name}</span>
              </span>
              <span className="shrink-0 text-zinc-500" title={a.error}>
                {a.status === "scanning"
                  ? "scanning…"
                  : a.status === "failed"
                    ? "failed"
                    : `${a.count} found · ${a.ms}ms`}
              </span>
            </li>
          ))}
        </ul>
      )}
      {log.length > 0 && (
        <pre className="max-h-40 overflow-auto border-t border-zinc-800 bg-zinc-950 px-4 py-3 font-mono text-[11px] leading-5 text-zinc-500">
          {log.join("\n")}
        </pre>
      )}
    </section>
  );
}

function Dot({ status }: { status: AdapterState["status"] }) {
  const cls =
    status === "done"
      ? "bg-accent"
      : status === "failed"
        ? "bg-red-500"
        : "animate-pulse bg-zinc-500";
  return <span className={`size-1.5 shrink-0 rounded-full ${cls}`} aria-label={status} />;
}
