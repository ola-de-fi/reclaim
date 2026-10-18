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

// Ledger palette
const PAPER = "#F4EFE4";
const CARD = "#FBF8F1";
const RULE = "#CFC6B2";
const INK = "#1A1814";
const INK2 = "#4A453C";
const INK3 = "#6B6458";
const STAMP = "#C2361B";
const NAVY = "#1F3A5F";

type FontEntry = { name: string; data: ArrayBuffer; weight: 400 | 600; style: "normal" };

// Fonts are fetched once per isolate from Google Fonts and cached in module
// scope. Any failure (network, timeout, parse) falls back to built-in fonts.
let fontsPromise: Promise<FontEntry[]> | null = null;

async function loadGoogleFont(family: string, weight: number): Promise<ArrayBuffer> {
  const cssUrl = `https://fonts.googleapis.com/css2?family=${family}:wght@${weight}&display=swap`;
  // No browser UA -> Google serves TrueType, which satori can parse.
  const css = await (await fetch(cssUrl, { signal: AbortSignal.timeout(2500) })).text();
  const m = css.match(
    /src: url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\) format\('(truetype|opentype)'\)/,
  );
  if (!m?.[1]) throw new Error("font url not found");
  const res = await fetch(m[1], { signal: AbortSignal.timeout(2500) });
  if (!res.ok) throw new Error(`font fetch ${res.status}`);
  return res.arrayBuffer();
}

function getFonts(): Promise<FontEntry[]> {
  if (!fontsPromise) {
    fontsPromise = Promise.all([
      loadGoogleFont("Instrument+Serif", 400),
      loadGoogleFont("IBM+Plex+Mono", 400),
      loadGoogleFont("IBM+Plex+Mono", 600),
    ])
      .then(([serif, mono, monoBold]): FontEntry[] => [
        { name: "Instrument Serif", data: serif, weight: 400, style: "normal" },
        { name: "IBM Plex Mono", data: mono, weight: 400, style: "normal" },
        { name: "IBM Plex Mono", data: monoBold, weight: 600, style: "normal" },
      ])
      .catch(() => {
        fontsPromise = null; // retry on a later request
        return [];
      });
  }
  return fontsPromise;
}

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const claimable = num(p.get("claimable"));
  const pending = num(p.get("pending"));
  const found = Math.floor(num(p.get("found")));
  const total = Math.min(claimable + pending, MAX * 2);

  const fonts = await getFonts();
  const hasFonts = fonts.length > 0;
  const SERIF = hasFonts ? "Instrument Serif" : "serif";
  const MONO = hasFonts ? "IBM Plex Mono" : "monospace";

  const stamp =
    claimable > 0
      ? { text: "CLAIMABLE", color: STAMP }
      : pending > 0
        ? { text: "IN TRANSIT", color: STAMP }
        : { text: "NOTHING FOUND", color: INK3 };

  const dots = Array.from({ length: 22 });

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: PAPER,
        backgroundImage:
          "repeating-linear-gradient(0deg, transparent 0px, transparent 31px, rgba(26,24,20,0.05) 31px, rgba(26,24,20,0.05) 32px)",
        color: INK,
        fontFamily: MONO,
      }}
    >
      {/* Ticket */}
      <div
        style={{
          width: 1080,
          height: 510,
          display: "flex",
          backgroundColor: CARD,
          border: `2px solid ${INK}`,
          boxShadow: `10px 10px 0 ${RULE}`,
        }}
      >
        {/* Main body */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "40px 48px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              borderBottom: `1.5px solid ${INK}`,
              paddingBottom: 14,
              fontSize: 18,
              letterSpacing: 3,
              color: INK2,
            }}
          >
            <div style={{ display: "flex" }}>RECLAIM · LOST-PROPERTY OFFICE</div>
            <div style={{ display: "flex", color: STAMP }}>CLAIM TICKET</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontFamily: SERIF, fontSize: 54, color: INK2, lineHeight: 1 }}>Found</div>
            <div
              style={{
                fontFamily: MONO,
                fontWeight: 600,
                fontSize: 132,
                letterSpacing: -6,
                lineHeight: 1.1,
                color: INK,
              }}
            >
              {usd(total)}
            </div>
            <div style={{ display: "flex", fontSize: 28, color: INK2, marginTop: 6 }}>
              <span style={{ color: STAMP }}>{usd(claimable)}</span>
              <span>&nbsp;claimable ·&nbsp;</span>
              <span style={{ color: NAVY }}>{usd(pending)}</span>
              <span>&nbsp;pending</span>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              borderTop: `1px solid ${RULE}`,
              paddingTop: 16,
              fontSize: 22,
              color: INK3,
            }}
          >
            <div style={{ display: "flex", fontFamily: SERIF, fontSize: 30, color: INK2 }}>
              on Robinhood Chain
            </div>
            <div style={{ display: "flex" }}>
              {found > 0 ? `${found} item${found === 1 ? "" : "s"}` : ""}
            </div>
          </div>
        </div>

        {/* Perforation */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "14px 0",
            width: 14,
            alignItems: "center",
          }}
        >
          {dots.map((_, i) => (
            <div
              key={i}
              style={{
                width: 9,
                height: 9,
                borderRadius: 9,
                backgroundColor: PAPER,
                border: `1px solid ${RULE}`,
              }}
            />
          ))}
        </div>

        {/* Stub */}
        <div
          style={{
            width: 290,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "40px 20px",
          }}
        >
          <div style={{ display: "flex", fontSize: 16, letterSpacing: 3, color: INK3 }}>
            STUB · KEEP
          </div>
          <div
            style={{
              display: "flex",
              transform: "rotate(-8deg)",
              border: `4px solid ${stamp.color}`,
              borderRadius: 6,
              padding: 5,
              opacity: 0.9,
            }}
          >
            <div
              style={{
                display: "flex",
                border: `2px solid ${stamp.color}`,
                borderRadius: 3,
                padding: "12px 16px 10px",
                fontFamily: MONO,
                fontWeight: 600,
                fontSize: stamp.text.length > 10 ? 21 : 30,
                whiteSpace: "nowrap",
                letterSpacing: 4,
                color: stamp.color,
              }}
            >
              {stamp.text}
            </div>
          </div>
          <div style={{ display: "flex", fontSize: 16, letterSpacing: 2, color: INK3 }}>
            NO. {String(found).padStart(4, "0")}
          </div>
        </div>
      </div>
    </div>,
    { width: 1200, height: 630, fonts: hasFonts ? fonts : undefined },
  );
}
