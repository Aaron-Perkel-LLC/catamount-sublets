// Builds the Catamount Sublets asset pack: SVG masters, PNG exports, favicons,
// social cards, the drop-in files for the website, and a contact sheet.
// Usage: node build.mjs <outDir> [sharpFrom]
// sharpFrom is any package.json whose node_modules has sharp installed; the
// default is this repo's.
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { C, FAR_EAR, roof } from "./marks.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(process.argv[2] ?? "pack");
const sharp = createRequire(process.argv[3] ? path.resolve(process.argv[3]) : path.join(here, "../../package.json"))("sharp");
const glyphs = (n) => JSON.parse(readFileSync(path.join(here, "glyphs", `${n}.json`), "utf8"));

// ---- drawing helpers -------------------------------------------------------
function parts(cat, fill) {
  return cat.map((p) => p.kind === "stroke"
    ? `<path d="${p.d}" fill="none" stroke="${fill}" stroke-width="${p.w}" stroke-linecap="round" stroke-linejoin="round"/>`
    : `<path d="${p.d}" fill="${fill}"/>`).join("");
}

/**
 * The roof cat as an SVG fragment in mark units. No masks or ids, so it can be
 * inlined any number of times. `bold` fattens the tail and leg for tab sizes.
 */
function markGroup({ house, cat, bold = 0, farEar = true }) {
  let c = roof.cat.map((p) => (p.kind === "stroke" ? { ...p, w: p.w + bold } : p));
  if (!farEar) c = c.filter((p) => p.d !== FAR_EAR);
  return `<path d="${roof.house}${roof.door}" fill="${house}" fill-rule="evenodd"/>` + parts(c, cat);
}

// Content box of the drawing, in mark units.
const BOX = { x: 14, y: 40, w: 200, h: 193 };

// Wordmark: outlined Bricolage, font units (upm 1000), baseline at y = 0.
const W = {
  full: glyphs("cat-sub-700"),
  cat: glyphs("cat-700"),
  sub: glyphs("sub-400"),
  tagline: glyphs("tagline-400"),
  domain: glyphs("domain-700"),
};
const CAP = 660;
const r = (n, p = 2) => +n.toFixed(p);
const text = (g, x, y, capPx, fill) =>
  `<path transform="translate(${r(x)} ${r(y)}) scale(${r(capPx / CAP, 5)})" d="${g.d}" fill="${fill}"/>`;
const textW = (g, capPx) => (g.width * capPx) / CAP;

const svgDoc = (w, h, body, { bg, size = true } = {}) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r(w)} ${r(h)}"${size ? ` width="${r(w)}" height="${r(h)}"` : ""}>` +
  (bg ? `<rect width="100%" height="100%" fill="${bg}"/>` : "") + body + `</svg>\n`;

/** Place the mark so its content box is hPx tall with its top-left at (x, y). */
function placeMark(x, y, hPx, opts) {
  const k = hPx / BOX.h;
  return { svg: `<g transform="translate(${r(x - BOX.x * k)} ${r(y - BOX.y * k)}) scale(${r(k, 5)})">${markGroup(opts)}</g>`, w: BOX.w * k };
}

// ---- colourways ------------------------------------------------------------
const WAYS = {
  "": { house: C.lake, cat: C.maple, word: C.lake, sub: C.maple },
  "-reversed": { house: C.cream, cat: C.maple, word: C.cream, sub: C.cream },
  "-mono-lake": { house: C.lake, cat: C.lake, word: C.lake, sub: C.lake },
  "-mono-ink": { house: C.ink, cat: C.ink, word: C.ink, sub: C.ink },
  "-mono-white": { house: C.paper, cat: C.paper, word: C.paper, sub: C.paper },
};

// ---- masters ---------------------------------------------------------------
const files = {}; // name -> { svg, w, h }
const add = (name, w, h, body) => (files[name] = { svg: svgDoc(w, h, body), w, h });

for (const [suf, cw] of Object.entries(WAYS)) {
  const pad = 8;
  add(`mark-roofcat${suf}`, BOX.w + pad * 2, BOX.h + pad * 2, placeMark(pad, pad, BOX.h, cw).svg);

  const cap = 66;
  add(`wordmark${suf}`, textW(W.full, cap) + 16, cap * 1.5 + 16, text(W.full, 8, 8 + cap * 1.25, cap, cw.word));

  {
    const mh = 230, capH = 64, gapX = 40, p = 24;
    const m = placeMark(p, p, mh, cw);
    const baseline = p + mh * 0.62 + capH / 2;
    add(`lockup-horizontal${suf}`, p + m.w + gapX + textW(W.full, capH) + p, mh + p * 2,
      m.svg + text(W.full, p + m.w + gapX, baseline, capH, cw.word));
  }
  {
    const mh = 300, p = 32, capA = 76, capB = 50;
    const wA = textW(W.cat, capA), wB = textW(W.sub, capB);
    const mw = (BOX.w * mh) / BOX.h;
    const width = Math.max(wA, mw) + p * 2;
    const yA = p + mh + 44 + capA, yB = yA + 30 + capB;
    add(`lockup-stacked${suf}`, width, yB + 16 + p,
      placeMark((width - mw) / 2, p, mh, cw).svg + text(W.cat, (width - wA) / 2, yA, capA, cw.word) + text(W.sub, (width - wB) / 2, yB, capB, cw.sub));
  }
}

// Tile: cream house + maple cat on lake. `small` is the bolder drawing for tabs.
function tile({ size = 256, radius = 56, scale = 0.74, small = false }) {
  const h = size * (small ? 0.8 : scale);
  const k = h / BOX.h;
  const m = placeMark((size - BOX.w * k) / 2, (size - h) / 2 + size * 0.01, h,
    { house: C.cream, cat: C.maple, bold: small ? 5 : 0, farEar: !small });
  return (radius === null ? "" : `<rect width="${size}" height="${size}" rx="${radius}" fill="${C.lake}"/>`) + m.svg;
}
add("mark-roofcat-tile", 256, 256, tile({}));
const iconSmall = svgDoc(256, 256, tile({ small: true }), { size: false });
const appleTile = svgDoc(256, 256, tile({ radius: 0 }));

// ---- social ----------------------------------------------------------------
function socialCard(w, h, { vertical }) {
  const capTag = vertical ? 36 : 34;
  const mh = vertical ? 500 : 230;
  const mw = (BOX.w * mh) / BOX.h;
  const lines = vertical ? [[W.cat, 124], [W.sub, 92]] : [[W.full, 78]];
  const lineGap = vertical ? 44 : 0;
  const textH = lines.reduce((a, [, c]) => a + c, 0) + lineGap * (lines.length - 1);
  const top = (h - 16 - (mh + 70 + textH + 48 + capTag)) / 2 - (vertical ? 40 : 0);
  let body = `<rect width="${w}" height="${h}" fill="${C.lake}"/>` + placeMark((w - mw) / 2, top, mh, { house: C.cream, cat: C.maple }).svg;
  let y = top + mh + 70;
  for (const [g, cap] of lines) {
    y += cap;
    body += text(g, (w - textW(g, cap)) / 2, y, cap, C.cream);
    y += lineGap;
  }
  y += (vertical ? 72 : 48) - lineGap + capTag;
  body += text(W.tagline, (w - textW(W.tagline, capTag)) / 2, y, capTag, C.cream) + `<rect y="${h - 16}" width="${w}" height="16" fill="${C.maple}"/>`;
  if (vertical) body += text(W.domain, (w - textW(W.domain, 30)) / 2, h - 140, 30, C.cream);
  return svgDoc(w, h, body);
}
const social = {
  "og-default-1200x630": socialCard(1200, 630, { vertical: false }),
  "story-default-1080x1920": socialCard(1080, 1920, { vertical: true }),
  "instagram-avatar-1080": svgDoc(1080, 1080, tile({ size: 1080, radius: 0, scale: 0.6 })),
};

// ---- write -----------------------------------------------------------------
const dir = (d) => (mkdirSync(path.join(OUT, d), { recursive: true }), path.join(OUT, d));
const pngBuf = (svg, width) => sharp(Buffer.from(svg), { density: 72 * Math.max(1, width / 256) }).resize({ width }).png({ compressionLevel: 9 }).toBuffer();
const png = async (svg, file, width) => writeFileSync(file, await pngBuf(svg, width));

/** A .ico holding PNG images (Vista+ format; every browser reads it). */
function ico(images) {
  const head = Buffer.alloc(6 + 16 * images.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(images.length, 4);
  let offset = head.length;
  images.forEach(({ size, data }, i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(size >= 256 ? 0 : size, e); head.writeUInt8(size >= 256 ? 0 : size, e + 1);
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(data.length, e + 8); head.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([head, ...images.map((i) => i.data)]);
}

const svgDir = dir("svg"), pngDir = dir("png"), favDir = dir("favicon"), socDir = dir("social");
for (const [name, f] of Object.entries(files)) {
  writeFileSync(path.join(svgDir, `${name}.svg`), f.svg);
  for (const size of [512, 1024, 2048]) await png(f.svg, path.join(pngDir, `${name}@${size}.png`), f.w >= f.h ? size : Math.round((size * f.w) / f.h));
}
writeFileSync(path.join(favDir, "icon.svg"), iconSmall);
for (const [n, s] of [["favicon-16", 16], ["favicon-32", 32], ["favicon-48", 48], ["apple-touch-icon-180", 180], ["icon-192", 192], ["icon-512", 512]])
  await png(n.startsWith("apple") ? appleTile : s <= 48 ? iconSmall : files["mark-roofcat-tile"].svg, path.join(favDir, `${n}.png`), s);
const icoBuf = ico(await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await pngBuf(iconSmall, size) }))));
writeFileSync(path.join(favDir, "favicon.ico"), icoBuf);
for (const [n, svg] of Object.entries(social)) {
  writeFileSync(path.join(socDir, `${n}.svg`), svg);
  await png(svg, path.join(socDir, `${n}.png`), +svg.match(/width="(\d+)"/)[1]);
}

// ---- website drop-ins (paths mirror the repo) ------------------------------
{
  const appDir = dir("web/src/app"), pubDir = dir("web/public"), webDir = dir("web");
  writeFileSync(path.join(appDir, "icon.svg"), iconSmall);
  writeFileSync(path.join(appDir, "favicon.ico"), icoBuf);
  await png(appleTile, path.join(appDir, "apple-icon.png"), 180);
  await png(social["og-default-1200x630"], path.join(pubDir, "og-default.png"), 1200);
  await png(social["story-default-1080x1920"], path.join(pubDir, "story-default.png"), 1080);
  // Reference drawings for src/components/Mark.tsx: square viewBox, no ids, no masks.
  const side = 216, ox = (side - BOX.w) / 2 - BOX.x, oy = (side - BOX.h) / 2 - BOX.y;
  writeFileSync(path.join(webDir, "mark.svg"), svgDoc(side, side,
    `<g transform="translate(${r(ox)} ${r(oy)})">${markGroup({ house: C.lake, cat: C.maple })}</g>`, { size: false }));
  writeFileSync(path.join(webDir, "mark-small.svg"), svgDoc(side, side,
    `<g transform="translate(${r(ox)} ${r(oy)})">${markGroup({ house: C.lake, cat: C.maple, bold: 5, farEar: false })}</g>`, { size: false }));
}

// ---- contact sheet ---------------------------------------------------------
{
  const W0 = 1600;
  let y = 120, body = "";
  const label = (t, x, yy, fill = C.ink) =>
    `<text x="${x}" y="${yy}" font-family="Helvetica, Arial, sans-serif" font-size="20" font-weight="700" fill="${fill}">${t}</text>`;
  const inner = (svg) => svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  const embed = (name, x, yy, w, h) => {
    const f = files[name];
    const k = Math.min(w / f.w, h / f.h);
    return `<g transform="translate(${r(x + (w - f.w * k) / 2)} ${r(yy + (h - f.h * k) / 2)}) scale(${r(k, 4)})">${inner(f.svg)}</g>`;
  };
  body += text(W.full, 60, 80, 34, C.lake) + label("Asset pack · from Riley's concepts", 60 + textW(W.full, 34) + 24, 78);
  const row = (items, h, dark) => {
    const cw = (W0 - 120) / items.length;
    if (dark) body += `<rect x="40" y="${y - 10}" width="${W0 - 80}" height="${h + 60}" rx="16" fill="${C.lake}"/>`;
    items.forEach(([name, lab], i) => {
      body += embed(name, 60 + i * cw + 20, y, cw - 40, h) + label(lab, 60 + i * cw + 20, y + h + 34, dark ? C.cream : C.ink);
    });
    y += h + 80;
  };
  row([["mark-roofcat", "Mark"], ["mark-roofcat-tile", "Tile · app icon"], ["mark-roofcat-mono-lake", "One colour"], ["mark-roofcat-mono-ink", "Ink"]], 260);
  row([["lockup-horizontal", "Horizontal lockup"], ["lockup-stacked", "Stacked lockup"]], 260);
  row([["lockup-horizontal-reversed", "Reversed"], ["mark-roofcat-reversed", "Reversed mark"], ["mark-roofcat-mono-white", "White"]], 220, true);
  let x = 60;
  body += label("Favicon sizes (bolder drawing below 48 px)", 60, y);
  y += 24;
  for (const s of [16, 24, 32, 48, 64]) {
    body += `<g transform="translate(${x} ${y}) scale(${s / 256})">${inner(iconSmall)}</g>`;
    x += s + 32;
  }
  x += 80;
  for (const [n, c] of [["lake", C.lake], ["maple", C.maple], ["cream", C.cream], ["ink", C.ink]]) {
    body += `<rect x="${x}" y="${y}" width="64" height="64" rx="12" fill="${c}" stroke="${C.ink}" stroke-opacity=".12"/>` + label(n, x, y + 88) +
      `<text x="${x}" y="${y + 110}" font-family="Helvetica, Arial, sans-serif" font-size="16" fill="${C.ink}">${c}</text>`;
    x += 110;
  }
  y += 140;
  const sheet = svgDoc(W0, y, body, { bg: C.cream });
  writeFileSync(path.join(OUT, "preview.svg"), sheet);
  await png(sheet, path.join(OUT, "preview.png"), W0);
}
console.log("built", Object.keys(files).length, "masters into", OUT);
