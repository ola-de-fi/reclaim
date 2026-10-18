// Generates Reclaim brand assets with text converted to vector outlines.
//   node scripts/brand/export.mjs
// Output: design/brand/assets/*.svg|png  (fonts fetched from Google Fonts at run time)
import { mkdir, writeFile } from "node:fs/promises";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";

const OUT = new URL("../../design/brand/assets/", import.meta.url);

export const C = {
  paper: "#F4EFE4",
  card: "#FBF8F1",
  ink: "#1A1814",
  ink2: "#4A453C",
  ink3: "#6B6458",
  rule: "#CFC6B2",
  stamp: "#C2361B",
};
const DOMAIN = "usereclaim.xyz";
const RING = "LOST PROPERTY • RECLAIMED • ON CHAIN • ";

/** Google Fonts CSS API returns TTF when asked without a browser user agent. */
async function font(family, { weight = 400, italic = false } = {}) {
  const axis = italic ? `ital,wght@1,${weight}` : `wght@${weight}`;
  const css = await (
    await fetch(`https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:${axis}`)
  ).text();
  const url = css.match(/src: url\((.+?)\) format\('(?:truetype|opentype)'\)/)?.[1];
  if (!url) throw new Error(`No TTF for ${family} ${axis}`);
  return {
    name: family,
    data: await (await fetch(url)).arrayBuffer(),
    weight,
    style: italic ? "italic" : "normal",
  };
}

const h = (type, style = {}, children) => ({ type, props: { style, children } });

/**
 * The Reclaim stamp. `ring: false` is the small-size variant (favicon, < ~48px):
 * no ring text, heavier rules, filled card centre so it holds on any background.
 */
export function stamp(size, { color = C.stamp, ring = true, fill = "transparent", rotate = -12 } = {}) {
  const s = size;
  const outerW = ring ? 0.0375 * s : 0.07 * s;
  const innerR = ring ? 0.3 * s : 0.33 * s;
  const innerW = ring ? 0.013 * s : 0.03 * s;
  const kids = [
    h("div", {
      position: "absolute",
      left: 0.04 * s,
      top: 0.04 * s,
      width: 0.92 * s,
      height: 0.92 * s,
      borderRadius: "50%",
      border: `${outerW}px solid ${color}`,
      boxSizing: "border-box",
      backgroundColor: fill,
    }),
    h("div", {
      position: "absolute",
      left: s / 2 - innerR,
      top: s / 2 - innerR,
      width: innerR * 2,
      height: innerR * 2,
      borderRadius: "50%",
      border: `${innerW}px solid ${color}`,
      boxSizing: "border-box",
    }),
    h(
      "div",
      {
        position: "absolute",
        left: 0,
        top: 0,
        width: s,
        height: s,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Instrument Serif",
        fontSize: (ring ? 0.47 : 0.62) * s,
        color,
        lineHeight: 1,
        paddingTop: (ring ? 0.035 : 0.05) * s,
      },
      "R",
    ),
  ];
  if (ring) {
    const chars = [...RING];
    const r = 0.375 * s;
    const fs = 0.083 * s;
    chars.forEach((ch, i) => {
      if (ch === " ") return;
      const deg = -90 + (i * 360) / chars.length;
      const rad = (deg * Math.PI) / 180;
      kids.push(
        h(
          "div",
          {
            position: "absolute",
            left: s / 2 + r * Math.cos(rad) - fs / 2,
            top: s / 2 + r * Math.sin(rad) - fs / 2,
            width: fs,
            height: fs,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "IBM Plex Mono",
            fontWeight: 600,
            fontSize: fs,
            color,
            transform: `rotate(${deg + 90}deg)`,
          },
          ch,
        ),
      );
    });
  }
  return h(
    "div",
    { position: "relative", width: s, height: s, display: "flex", transform: `rotate(${rotate}deg)` },
    kids,
  );
}

const ruled = (gap = 32) => ({
  backgroundColor: C.paper,
  backgroundImage: `repeating-linear-gradient(0deg, transparent 0, transparent ${gap - 1}px, ${C.rule}55 ${gap - 1}px, ${C.rule}55 ${gap}px)`,
});

async function main() {
  const fonts = await Promise.all([
    font("Instrument Serif"),
    font("Instrument Serif", { italic: true }),
    font("IBM Plex Mono", { weight: 400 }),
    font("IBM Plex Mono", { weight: 600 }),
    font("IBM Plex Sans", { weight: 400 }),
  ]);
  await mkdir(OUT, { recursive: true });

  async function render(name, node, width, height, { png = true, svg = true } = {}) {
    const out = await satori(node, { width, height, fonts });
    if (svg) await writeFile(new URL(`${name}.svg`, OUT), out);
    if (png) {
      const scale = width < 600 ? 2 : 1;
      const img = new Resvg(out, { fitTo: { mode: "width", value: width * scale } }).render();
      await writeFile(new URL(`${name}.png`, OUT), img.asPng());
    }
    console.log("wrote", name);
  }
  const box = (w, hgt, style, children) =>
    h("div", { width: w, height: hgt, display: "flex", ...style }, children);

  // --- Logo marks ---
  await render("mark", box(512, 512, { alignItems: "center", justifyContent: "center" }, stamp(500)), 512, 512);
  await render("mark-paper", box(512, 512, { alignItems: "center", justifyContent: "center" }, stamp(500, { color: C.card })), 512, 512);
  await render("mark-ink", box(512, 512, { alignItems: "center", justifyContent: "center" }, stamp(500, { color: C.ink })), 512, 512);
  await render(
    "mark-small",
    box(64, 64, { alignItems: "center", justifyContent: "center" }, stamp(64, { ring: false, fill: C.card })),
    64,
    64,
  );

  // --- Lockups ---
  const lockup = (color, word) =>
    box(1000, 300, { alignItems: "center", gap: 36, paddingLeft: 20 }, [
      stamp(260, { color }),
      h("div", { fontFamily: "Instrument Serif", fontSize: 190, color: word, lineHeight: 1, letterSpacing: -3, display: "flex" }, "Reclaim"),
    ]);
  await render("lockup", lockup(C.stamp, C.ink), 1000, 300);
  await render("lockup-reversed", box(1000, 300, { backgroundColor: C.ink }, lockup(C.card, C.card)), 1000, 300);

  // --- App icons ---
  const appIcon = (s) =>
    box(s, s, { alignItems: "center", justifyContent: "center", backgroundColor: C.paper }, stamp(s * 0.86, { ring: s >= 256, fill: C.card }));
  await render("app-icon-512", appIcon(512), 512, 512, { svg: false });
  await render("apple-touch-icon", appIcon(180), 180, 180, { svg: false });

  // --- Social: avatar (X crops to a circle) ---
  await render(
    "x-avatar",
    box(400, 400, { alignItems: "center", justifyContent: "center", ...ruled(20) }, stamp(330, { fill: C.card })),
    400,
    400,
    { svg: false },
  );

  // --- Social: X header (1500x500). Keep bottom-left clear: the avatar overlaps it. ---
  await render(
    "x-banner",
    box(1500, 500, { ...ruled(32), position: "relative" }, [
      h("div", { position: "absolute", left: 440, top: 100, display: "flex", flexDirection: "column", width: 640 }, [
        h("div", { fontFamily: "IBM Plex Mono", fontWeight: 600, fontSize: 18, letterSpacing: 3, color: C.ink2, display: "flex" }, "LOST-PROPERTY OFFICE · ROBINHOOD CHAIN"),
        h("div", { display: "flex", flexWrap: "wrap", fontFamily: "Instrument Serif", fontSize: 74, lineHeight: 1.02, color: C.ink, marginTop: 22, letterSpacing: -1 }, [
          h("span", { marginRight: 20 }, "Money you"),
          h("span", { fontStyle: "italic", color: C.stamp, marginRight: 20 }, "left behind"),
          h("span", {}, "is still waiting for you."),
        ]),
        h("div", { fontFamily: "IBM Plex Mono", fontSize: 22, color: C.ink, marginTop: 30, display: "flex" }, DOMAIN),
      ]),
      h("div", { position: "absolute", right: 80, top: 90, display: "flex" }, stamp(320)),
    ]),
    1500,
    500,
    { svg: false },
  );

  // --- Social: launch post card (1200x675) ---
  await render(
    "post-launch",
    box(1200, 675, { ...ruled(32), position: "relative" }, [
      h("div", { position: "absolute", left: 80, top: 80, width: 720, display: "flex", flexDirection: "column" }, [
        h("div", { fontFamily: "IBM Plex Mono", fontWeight: 600, fontSize: 20, letterSpacing: 3, color: C.stamp, display: "flex" }, "NOW OPEN"),
        h("div", { display: "flex", flexWrap: "wrap", fontFamily: "Instrument Serif", fontSize: 92, lineHeight: 0.98, color: C.ink, marginTop: 20, letterSpacing: -1 }, [
          h("span", { marginRight: 22 }, "Lost something on"),
          h("span", { fontStyle: "italic", color: C.stamp }, "Robinhood Chain?"),
        ]),
        h("div", { fontFamily: "IBM Plex Sans", fontSize: 30, lineHeight: 1.35, color: C.ink2, marginTop: 30, display: "flex" },
          "Reclaim finds unclaimed bridge withdrawals and failed deposits, then helps you get them back. No wallet needed to look. No fee."),
      ]),
      h("div", { position: "absolute", right: 80, top: 150, display: "flex" }, stamp(300)),
      h("div", { position: "absolute", left: 80, bottom: 60, right: 80, borderTop: `2px solid ${C.ink}`, paddingTop: 18, display: "flex", justifyContent: "space-between", fontFamily: "IBM Plex Mono", fontSize: 24, color: C.ink }, [
        h("span", {}, DOMAIN),
        h("span", { color: C.ink3 }, "Non-custodial · simulated before you sign"),
      ]),
    ]),
    1200,
    675,
    { svg: false },
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
