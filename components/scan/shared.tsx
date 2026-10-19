"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { getChainById } from "@/config/chains";
import type { ClaimablePosition, PositionCategory } from "@/lib/scanner/types";

export const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export const chainName = (id: number) => getChainById(id)?.name ?? String(id);

export const itemNo = (i: number) => `Nº ${String(i + 1).padStart(4, "0")}`;

export const CATEGORY_LABEL: Record<PositionCategory, string> = {
  bridge: "Withdrawal",
  yield: "Yield",
  airdrop: "Airdrop",
  pool: "Pool",
  lending: "Lending",
  dust: "Dust",
};

export const ClaimContext = createContext<{
  open: (p: ClaimablePosition) => void;
  claimed: Set<string>;
}>({
  open: () => {},
  claimed: new Set(),
});

export const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

/** Current time in ms, ticking every minute. Null until mounted (avoids hydration mismatch). */
export function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function formatRemaining(s: number) {
  if (s <= 0) return "ready";
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h` : `${Math.max(1, m)}m`;
}

export function Countdown({ readyAt }: { readyAt: number }) {
  const now = useNow();
  if (now === null) return <span>…</span>;
  return <span>{formatRemaining(readyAt - Math.floor(now / 1000))}</span>;
}

export function RiskMark({ p }: { p: ClaimablePosition }) {
  if (p.risk.verified) return null;
  const note = p.risk.notes ?? "Unverified";
  return (
    <span
      className="ml-1 inline-block border border-stamp-ink px-1 font-mono text-[11px] leading-4 font-semibold text-stamp-ink"
      title={note}
      aria-label={`Unverified: ${note}`}
    >
      !
    </span>
  );
}

export function netAfterGas(p: ClaimablePosition) {
  if (p.estimatedUsdValue === null || p.estimatedGasUsd == null) return null;
  return p.estimatedUsdValue - p.estimatedGasUsd;
}

export function Action({ p, block }: { p: ClaimablePosition; block?: boolean }) {
  const { open, claimed } = useContext(ClaimContext);
  const base = `${block ? "block w-full text-center" : "inline-block"} px-3 py-2 font-mono text-xs font-semibold tracking-[0.12em] uppercase ${focusRing}`;
  if (claimed.has(p.id)) {
    return (
      <span className={`${base} border-2 border-ink text-ink`} role="status">
        ✓ Collected
      </span>
    );
  }
  if (p.kind === "claimable" && p.claimAction.type === "direct") {
    return (
      <button
        type="button"
        onClick={() => open(p)}
        className={`${base} border-2 border-ink bg-stamp text-card shadow-ledger hover:translate-x-px hover:translate-y-px hover:shadow-none`}
      >
        Collect
      </button>
    );
  }
  if (p.claimAction.type === "external") {
    return (
      <a
        href={p.claimAction.url}
        target="_blank"
        rel="noopener noreferrer"
        className={`${base} border-2 border-ink bg-card text-ink hover:bg-paper-2`}
      >
        Open in app ↗
      </a>
    );
  }
  if (p.kind === "wallet_asset") return null;
  // Multi-step claims and claims without calldata are not supported yet.
  return (
    <button
      type="button"
      disabled
      className={`${base} cursor-not-allowed border-2 border-dashed border-ink-3 text-ink-3`}
    >
      {p.kind === "pending" ? "Not ready" : "Collect · soon"}
    </button>
  );
}
