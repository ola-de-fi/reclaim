"use client";

import { useState } from "react";

export function formatUsd(n: number): string {
  const v = Number.isFinite(n) && n > 0 ? n : 0;
  return `$${v.toLocaleString("en-US", { maximumFractionDigits: v >= 100 ? 0 : 2, minimumFractionDigits: v >= 100 ? 0 : 2 })}`;
}

export function buildShare(
  origin: string,
  address: string,
  claimableUsd: number,
  pendingUsd: number,
) {
  const total = Math.max(0, claimableUsd) + Math.max(0, pendingUsd);
  const text = `I found ${formatUsd(total)} of forgotten crypto on Robinhood Chain with Reclaim`;
  const url = `${origin}/scan/${encodeURIComponent(address)}`;
  const intent = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
  return { text, url, intent };
}

export function ShareButton({
  claimableUsd,
  pendingUsd,
  count,
  address,
}: {
  claimableUsd: number;
  pendingUsd: number;
  count: number;
  address: string;
}) {
  const [copied, setCopied] = useState(false);
  if (!(claimableUsd + pendingUsd > 0)) return null;

  const btn =
    "inline-flex items-center gap-1.5 border border-ink bg-card px-2 py-0.5 font-mono text-xs text-ink hover:bg-paper-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stamp";

  async function onShare() {
    const s = buildShare(window.location.origin, address, claimableUsd, pendingUsd);
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ text: s.text, url: s.url });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    window.open(s.intent, "_blank", "noopener,noreferrer");
  }

  async function onCopy() {
    const s = buildShare(window.location.origin, address, claimableUsd, pendingUsd);
    try {
      await navigator.clipboard.writeText(s.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        className={btn}
        onClick={onShare}
        title={`Share ${count} found position${count === 1 ? "" : "s"}`}
      >
        <span className="size-1.5 bg-stamp" aria-hidden />
        Share
      </button>
      <button type="button" className={btn} onClick={onCopy}>
        {copied ? "Copied" : "Copy link"}
      </button>
    </span>
  );
}
