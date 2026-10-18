import { ImageResponse } from "next/og";

export const runtime = "edge";

const MAX = 1e9;

function num(v: string | null): number {
  if (v === null || !/^\d+(\.\d+)?$/.test(v.trim())) return 0;
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.min(Math.max(n, 0), MAX);
}

function usd(n: number): string {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: n >= 100 ? 0 : 2, minimumFractionDigits: n >= 100 ? 0 : 2 })}`;
}

export function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const claimable = num(p.get("claimable"));
  const pending = num(p.get("pending"));
  const found = Math.floor(num(p.get("found")));
  const total = Math.min(claimable + pending, MAX * 2);

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#09090b",
        color: "#f4f4f5",
        padding: 72,
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 18, height: 18, borderRadius: 4, background: "#b4f25a" }} />
        <div style={{ fontSize: 36, fontWeight: 700, letterSpacing: -1 }}>reclaim</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ fontSize: 40, color: "#a1a1aa" }}>Found</div>
        <div
          style={{
            fontSize: 140,
            fontWeight: 700,
            color: "#b4f25a",
            letterSpacing: -4,
            lineHeight: 1,
          }}
        >
          {usd(total)}
        </div>
        <div style={{ fontSize: 34, color: "#d4d4d8", fontFamily: "monospace" }}>
          {`${usd(claimable)} claimable · ${usd(pending)} pending`}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          borderTop: "2px solid #27272a",
          paddingTop: 28,
          fontSize: 28,
          color: "#71717a",
        }}
      >
        <div>on Robinhood Chain</div>
        <div style={{ fontFamily: "monospace" }}>
          {found > 0 ? `${found} position${found === 1 ? "" : "s"}` : ""}
        </div>
      </div>
    </div>,
    { width: 1200, height: 630 },
  );
}
