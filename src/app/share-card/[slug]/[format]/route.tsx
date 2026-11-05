import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import sharp from "sharp";
import { SITE } from "@/config/site";
import { getDb } from "@/db";
import { appUrl } from "@/env";
import { parseShareSlug } from "@/lib/share";
import { resolveShare } from "@/server/data/share";
import { log } from "@/server/log";

export const runtime = "nodejs";

/* eslint-disable @next/next/no-img-element -- Satori renders plain <img> elements, not next/image. */

/**
 * The preview image a share link unfurls into: 1200×630 for a link card,
 * 1080×1920 for a story. The photo sits in a near-square panel (phone
 * photos span 0.46–1.5 in aspect; a full-bleed crop kept a sliver), the
 * type on flat colour beside or below it. Never 500s: any failure serves
 * the static default, because a crawler caches the absence of a preview.
 */

const SIZES = { og: [1200, 630], story: [1080, 1920] } as const;
const CACHE = "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800";

const COLOURS = { lake: "#1D4F73", maple: "#BC4C25", paper: "#F7F3EC", muted: "#C4D8E8" };

let fontsPromise: Promise<{ bold: ArrayBuffer; regular: ArrayBuffer }> | undefined;
function fonts() {
  return (fontsPromise ??= Promise.all([
    readFile(path.join(process.cwd(), "assets/fonts/bricolage-grotesque-v9-700-opsz96.ttf")),
    readFile(path.join(process.cwd(), "assets/fonts/bricolage-grotesque-v9-400-opsz48.ttf")),
  ]).then(([b, r]) => ({ bold: toArrayBuffer(b), regular: toArrayBuffer(r) })));
}
const toArrayBuffer = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

async function fallback(format: keyof typeof SIZES): Promise<Response> {
  const file = format === "story" ? "story-default.png" : "og-default.png";
  const bytes = await readFile(path.join(process.cwd(), "public", file));
  return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "image/png", "Cache-Control": CACHE, "X-Robots-Tag": "noindex" } });
}

/** The cover as a data URI Satori can embed: fetched here (local or Blob), converted to JPEG if it is not one. */
async function coverDataUri(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const absolute = url.startsWith("/") ? `${appUrl()}${url}` : url;
    const res = await fetch(absolute, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    const jpeg = res.headers.get("content-type")?.includes("jpeg") ? bytes : await sharp(bytes).jpeg({ quality: 85 }).toBuffer();
    return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string; format: string }> }) {
  const { slug, format: f } = await params;
  const format: keyof typeof SIZES = f === "story" ? "story" : "og";
  try {
    const parsed = parseShareSlug(slug);
    if (!parsed) return fallback(format);
    const r = await resolveShare(await getDb(), parsed.id, parsed.token);
    if (r.state !== "open") return fallback(format);

    const [{ bold, regular }, photo] = await Promise.all([fonts(), coverDataUri(r.cardImageUrl)]);
    const [width, height] = SIZES[format];
    const lines = r.lines;
    const factLine = [lines.semester, lines.facts].filter(Boolean).join(" · ");
    const brand = SITE.name.toUpperCase();

    const element =
      format === "story" ? (
        <div style={{ display: "flex", flexDirection: "column", width, height, background: COLOURS.lake, color: COLOURS.paper, fontFamily: "Bricolage" }}>
          <div style={{ display: "flex", width: 1080, height: 1150, overflow: "hidden", background: "#163E5B" }}>
            {photo && <img src={photo} width={1080} height={1150} style={{ objectFit: "cover", width: 1080, height: 1150 }} alt="" />}
          </div>
          <div style={{ display: "flex", flexDirection: "column", padding: "72px 72px 0", flexGrow: 1 }}>
            <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: 8, color: COLOURS.maple }}>{brand}</div>
            <div style={{ fontSize: 128, fontWeight: 700, marginTop: 24, lineHeight: 1 }}>{lines.price}</div>
            {lines.negotiable && <div style={{ fontSize: 36, color: COLOURS.maple, marginTop: 16 }}>or best offer</div>}
            <div style={{ display: "flex", width: 936, fontSize: 44, marginTop: 24, lineHeight: 1.3, flexWrap: "wrap" }}>{factLine}</div>
            <div style={{ display: "flex", flexDirection: "column", marginTop: "auto", paddingBottom: 96 }}>
              <div style={{ fontSize: 32, color: COLOURS.muted }}>Full listing at</div>
              <div style={{ fontSize: 44, fontWeight: 700, color: COLOURS.maple }}>{SITE.domain}</div>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", width, height, background: COLOURS.lake, color: COLOURS.paper, fontFamily: "Bricolage" }}>
          {photo && (
            <div style={{ display: "flex", width: 552, height: 630, overflow: "hidden", background: "#163E5B" }}>
              <img src={photo} width={552} height={630} style={{ objectFit: "cover", width: 552, height: 630 }} alt="" />
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: 56, width: photo ? 648 : 1200 }}>
            <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: 6, color: COLOURS.maple }}>{brand}</div>
            <div style={{ fontSize: lines.price.length > 10 ? 60 : 76, fontWeight: 700, marginTop: 24, lineHeight: 1 }}>{lines.price}</div>
            {lines.negotiable && <div style={{ fontSize: 26, marginTop: 12 }}>or best offer</div>}
            <div style={{ display: "flex", width: photo ? 536 : 1088, fontSize: 30, marginTop: 20, lineHeight: 1.4, flexWrap: "wrap" }}>{factLine}</div>
          </div>
        </div>
      );

    return new ImageResponse(element, {
      width,
      height,
      fonts: [
        { name: "Bricolage", data: bold, weight: 700, style: "normal" },
        { name: "Bricolage", data: regular, weight: 400, style: "normal" },
      ],
      headers: { "Cache-Control": CACHE, "X-Robots-Tag": "noindex" },
    });
  } catch (error) {
    log.error("share.card_failed", error);
    return fallback(format);
  }
}
