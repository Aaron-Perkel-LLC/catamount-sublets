import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { isHeic, processPhoto } from "./process";

async function photo(width: number, height: number, format: "jpeg" | "png" | "webp" = "jpeg"): Promise<Buffer> {
  const base = sharp({ create: { width, height, channels: 3, background: { r: 29, g: 79, b: 115 } } });
  const withExif = format === "jpeg" ? base.jpeg().withMetadata({ exif: { IFD0: { Copyright: "x", ImageDescription: "gps-ish" } } }) : base[format]();
  return withExif.toBuffer();
}

describe("processPhoto", () => {
  it("makes the three variants from a capped, upright copy and strips metadata", async () => {
    const input = await photo(4000, 3000);
    const r = await processPhoto(input);
    expect("error" in r).toBe(false);
    if ("error" in r) return;
    expect([r.width, r.height]).toEqual([3000, 2250]);
    expect(r.source).toEqual({ contentType: "image/jpeg", ext: "jpg" });
    expect(r.bytes).toBe(r.display.data.length + r.thumb.data.length + r.card.data.length);
    expect(r.stem).toMatch(/^[a-f0-9]{32}$/);
    expect(r.sha256).toMatch(/^[a-f0-9]{64}$/);
    for (const v of [r.display, r.thumb, r.card]) expect((await sharp(v.data).metadata()).exif).toBeUndefined();
    const display = await sharp(r.display.data).metadata();
    expect(display.format).toBe("webp");
    expect(Math.max(display.width!, display.height!)).toBe(1600);
    const thumb = await sharp(r.thumb.data).metadata();
    expect(thumb.width).toBe(600);
    const card = await sharp(r.card.data).metadata();
    expect(card.format).toBe("jpeg");
    expect(Math.max(card.width!, card.height!)).toBe(1200);
  });

  it("keeps small images their size and png its format", async () => {
    const r = await processPhoto(await photo(800, 600, "png"));
    if ("error" in r) throw new Error(r.error);
    expect([r.width, r.height]).toEqual([800, 600]);
    expect(r.source.contentType).toBe("image/png");
    expect((await sharp(r.thumb.data).metadata()).width).toBe(600);
  });

  it("refuses non-images and HEIC", async () => {
    expect(await processPhoto(Buffer.from("<html>hi</html>"))).toEqual({ error: "unsupported" });
    const heic = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypheic"), Buffer.alloc(16)]);
    expect(isHeic(heic)).toBe(true);
    expect(await processPhoto(heic)).toEqual({ error: "heic" });
  });
});
