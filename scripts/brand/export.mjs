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
 * The Reclaim claim tag: a luggage tag (tilted -10°) with an eyelet, a string and a
 * return arrow. "This belongs to someone. Send it back."
 * `small` is the favicon/app variant: no string, heavier strokes, filled card body.
 */
export function tagSvg({ line = C.ink, fill = C.card, accent = C.stamp, small = false } = {}) {
  const w = small ? 5 : 3.6;
  const a = small ? 5.2 : 3.8;
  const string = small
    ? ""
    : `<path d="M6 14 C 10 22, 14 28, 20 32" fill="none" stroke="${line}" stroke-width="2.4" stroke-linecap="round"/>`;
  const body = small ? "M9 19 L20 9 H54 V55 H20 L9 45 Z" : "M16 20 L26 11 H56 V53 H26 L16 44 Z";
  const eye = small ? { cx: 18, cy: 32, r: 4 } : { cx: 23, cy: 32, r: 3.4 };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><g transform="rotate(-10 34 32)">${string}<path d="${body}" fill="${fill}" stroke="${line}" stroke-width="${w}" stroke-linejoin="round"/><circle cx="${eye.cx}" cy="${eye.cy}" r="${eye.r}" fill="${C.paper}" stroke="${line}" stroke-width="${small ? 4 : 3}"/><path d="${small ? "M46 24 H37 a8 8 0 0 0 0 16 H46" : "M49 24 H40 a8 8 0 0 0 0 16 H49"}" fill="none" stroke="${accent}" stroke-width="${a}" stroke-linecap="round"/><path d="${small ? "M41 34.5 L46.5 40 L41 45.5" : "M44 34.5 L49.5 40 L44 45.5"}" fill="none" stroke="${accent}" stroke-width="${a}" stroke-linecap="round" stroke-linejoin="round"/></g></svg>`;
}

/** Tag as a satori node (embedded SVG image). */
export function tag(size, opts) {
  const src = `data:image/svg+xml;base64,${Buffer.from(tagSvg(opts)).toString("base64")}`;
  return { type: "img", props: { src, width: size, height: size, style: {} } };
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

  // --- Logo marks (pure vector, no text) ---
  const writeMark = async (name, svg) => {
    await writeFile(new URL(`${name}.svg`, OUT), svg);
    const img = new Resvg(svg, { fitTo: { mode: "width", value: 1024 } }).render();
    await writeFile(new URL(`${name}.png`, OUT), img.asPng());
    console.log("wrote", name);
  };
  await writeMark("mark", tagSvg());
  await writeMark("mark-reversed", tagSvg({ line: C.paper, fill: C.ink, accent: "#E0573A" }));
  await writeMark("mark-ink", tagSvg({ accent: C.ink }));
  await writeMark("mark-small", tagSvg({ small: true }));

  // --- Lockups ---
  const lockup = (color, word) =>
    box(1000, 300, { alignItems: "center", gap: 36, paddingLeft: 20 }, [
      tag(270, color),
      h(
        "div",
        {
          fontFamily: "Instrument Serif",
          fontSize: 190,
          color: word,
          lineHeight: 1,
          letterSpacing: -3,
          display: "flex",
        },
        "Reclaim",
      ),
    ]);
  await render("lockup", lockup({}, C.ink), 1000, 300);
  await render(
    "lockup-reversed",
    box(
      1000,
      300,
      { backgroundColor: C.ink },
      lockup({ line: C.paper, fill: C.ink, accent: "#E0573A" }, C.card),
    ),
    1000,
    300,
  );

  // --- App icons ---
  const appIcon = (s) =>
    box(
      s,
      s,
      { alignItems: "center", justifyContent: "center", backgroundColor: C.paper },
      tag(s * 0.82, { small: s < 256 }),
    );
  await render("app-icon-512", appIcon(512), 512, 512, { svg: false });
  await render("apple-touch-icon", appIcon(180), 180, 180, { svg: false });

  // --- Social: avatar (X crops to a circle) ---
  await render(
    "x-avatar",
    box(400, 400, { alignItems: "center", justifyContent: "center", ...ruled(20) }, tag(300)),
    400,
    400,
    { svg: false },
  );

  // --- Social: X header (1500x500). Keep bottom-left clear: the avatar overlaps it. ---
  await render(
    "x-banner",
    box(1500, 500, { ...ruled(32), position: "relative" }, [
      h(
        "div",
        {
          position: "absolute",
          left: 440,
          top: 100,
          display: "flex",
          flexDirection: "column",
          width: 640,
        },
        [
          h(
            "div",
            {
              fontFamily: "IBM Plex Mono",
              fontWeight: 600,
              fontSize: 18,
              letterSpacing: 3,
              color: C.ink2,
              display: "flex",
            },
            "LOST-PROPERTY OFFICE · ROBINHOOD CHAIN",
          ),
          h(
            "div",
            {
              display: "flex",
              flexWrap: "wrap",
              fontFamily: "Instrument Serif",
              fontSize: 74,
              lineHeight: 1.02,
              color: C.ink,
              marginTop: 22,
              letterSpacing: -1,
            },
            [
              h("span", { marginRight: 20 }, "Money you"),
              h("span", { fontStyle: "italic", color: C.stamp, marginRight: 20 }, "left behind"),
              h("span", {}, "is still waiting for you."),
            ],
          ),
          h(
            "div",
            {
              fontFamily: "IBM Plex Mono",
              fontSize: 22,
              color: C.ink,
              marginTop: 30,
              display: "flex",
            },
            DOMAIN,
          ),
        ],
      ),
      h("div", { position: "absolute", right: 90, top: 70, display: "flex" }, tag(360)),
    ]),
    1500,
    500,
    { svg: false },
  );

  // --- Social: launch post card (1200x675) ---
  await render(
    "post-launch",
    box(1200, 675, { ...ruled(32), position: "relative" }, [
      h(
        "div",
        {
          position: "absolute",
          left: 80,
          top: 80,
          width: 720,
          display: "flex",
          flexDirection: "column",
        },
        [
          h(
            "div",
            {
              fontFamily: "IBM Plex Mono",
              fontWeight: 600,
              fontSize: 20,
              letterSpacing: 3,
              color: C.stamp,
              display: "flex",
            },
            "NOW OPEN",
          ),
          h(
            "div",
            {
              display: "flex",
              flexWrap: "wrap",
              fontFamily: "Instrument Serif",
              fontSize: 92,
              lineHeight: 0.98,
              color: C.ink,
              marginTop: 20,
              letterSpacing: -1,
            },
            [
              h("span", { marginRight: 22 }, "Lost something on"),
              h("span", { fontStyle: "italic", color: C.stamp }, "Robinhood Chain?"),
            ],
          ),
          h(
            "div",
            {
              fontFamily: "IBM Plex Sans",
              fontSize: 30,
              lineHeight: 1.35,
              color: C.ink2,
              marginTop: 30,
              display: "flex",
            },
            "Reclaim finds unclaimed bridge withdrawals and failed deposits, then helps you get them back. No wallet needed to look. No fee.",
          ),
        ],
      ),
      h("div", { position: "absolute", right: 70, top: 120, display: "flex" }, tag(330)),
      h(
        "div",
        {
          position: "absolute",
          left: 80,
          bottom: 60,
          right: 80,
          borderTop: `2px solid ${C.ink}`,
          paddingTop: 18,
          display: "flex",
          justifyContent: "space-between",
          fontFamily: "IBM Plex Mono",
          fontSize: 24,
          color: C.ink,
        },
        [
          h("span", {}, DOMAIN),
          h("span", { color: C.ink3 }, "Non-custodial · simulated before you sign"),
        ],
      ),
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
