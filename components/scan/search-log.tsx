"use client";

import type { AdapterState } from "@/lib/scanner/use-scan";

export function SearchLog({
  adapters,
  log,
  phase,
}: {
  adapters: AdapterState[];
  log: string[];
  phase: string;
}) {
  const complete = adapters.filter((a) => a.status !== "scanning").length;
  const running = phase === "connecting" || phase === "scanning";
  return (
    <section aria-labelledby="log-h" className="border border-ink bg-card">
      <div className="flex justify-between gap-3 border-b border-ink px-4 py-2.5 font-mono text-[11px] tracking-[0.12em] uppercase sm:px-5">
        <h2 id="log-h">Search log</h2>
        <span className="text-ink-2">
          {adapters.length > 0 ? `${complete} of ${adapters.length} complete` : phase}
        </span>
      </div>
      {adapters.length === 0 ? (
        <p className="px-4 py-4 font-mono text-xs text-ink-2 sm:px-5">
          {phase === "done"
            ? "No protocol adapters enabled yet. Set SCANNER_MOCK=1 in .env.local to preview."
            : phase === "error"
              ? "The clerk could not reach the register."
              : "Opening the register…"}
        </p>
      ) : (
        <ol role="status" aria-live="polite">
          {adapters.map((a, i) => (
            <li
              key={a.id}
              className="grid grid-cols-[2rem_1fr_auto] items-center gap-3 border-b border-dashed border-rule px-4 py-3 last:border-b-0 sm:px-5"
            >
              <span className="font-mono text-xs text-ink-3">{String(i + 1).padStart(2, "0")}</span>
              <span className="min-w-0">
                <span className="block truncate font-serif text-lg leading-tight">{a.name}</span>
                <span className="font-mono text-[11px] text-ink-3">{a.category}</span>
              </span>
              <span className="shrink-0 font-mono text-[11px]" title={a.error}>
                {a.status === "scanning" ? (
                  <span className="text-ink-2">searching…</span>
                ) : a.status === "failed" ? (
                  <span className="stamp text-stamp-ink">Failed</span>
                ) : (a.count ?? 0) > 0 ? (
                  <span className="stamp text-stamp-ink">
                    {a.count} found · {a.ms}ms
                  </span>
                ) : (
                  <span className="stamp text-ink-2">None · {a.ms}ms</span>
                )}
              </span>
            </li>
          ))}
        </ol>
      )}
      {log.length > 0 && (
        <pre className="max-h-40 overflow-auto border-t border-ink bg-paper-2 px-4 py-3 font-mono text-[11px] leading-5 whitespace-pre-wrap text-ink-2 sm:px-5">
          {log.join("\n")}
          {running && <span className="log-cursor" aria-hidden />}
        </pre>
      )}
      <style>{`
        .log-cursor{display:inline-block;width:7px;height:12px;margin-left:2px;vertical-align:-2px;background:var(--color-stamp);animation:log-blink 1s steps(2) infinite}
        @keyframes log-blink{50%{opacity:0}}
        @media (prefers-reduced-motion: reduce){.log-cursor{animation:none}}
      `}</style>
    </section>
  );
}
