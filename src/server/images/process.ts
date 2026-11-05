import { createHash, randomBytes } from "node:crypto";
import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";

/**
 * Every photo goes through here before it reaches the public store. Nothing
 * is stored at full size any more (8 October 2026: Blob storage and writes
 * are metered on the Hobby plan). The upload is turned upright, capped at
 * 3000 px and stripped to its ICC profile in memory, as the legacy did, and
 * three derived images are written from that: a display WebP at 1600 px, a
 * thumbnail WebP 600 px wide, and a JPEG card for the share image (Satori
 * cannot embed WebP). About 300 KB per photo in all. sharp strips EXIF, GPS
 * and XMP; files are typed by their bytes, never by their name.
 *
 * The in-memory normalisation step is kept exactly as it was so the derived
 * bytes stay identical run to run: the migration relies on that to reuse
 * files already in the store instead of writing them again.
 */

export const IMAGE_ORIGINAL_MAX_EDGE = 3000;
export const IMAGE_DISPLAY_MAX_EDGE = 1600;
export const IMAGE_THUMB_WIDTH = 600;
export const IMAGE_CARD_MAX_EDGE = 1200;

const ALLOWED: Record<string, "jpg" | "png" | "gif" | "webp"> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};

export interface Variant {
  data: Buffer;
  contentType: string;
  ext: string;
}

export interface ProcessedPhoto {
  stem: string;
  /** What arrived: recorded on the row, never stored as a file. */
  source: { contentType: string; ext: string };
  display: Variant;
  thumb: Variant;
  card: Variant;
  /** Dimensions of the upright, capped photo the variants were made from. */
  width: number;
  height: number;
  /** Bytes stored: the three variants together. */
  bytes: number;
  /** Hash of the normalised photo; stable across runs, so a re-import can tell "same picture". */
  sha256: string;
}

export type ProcessError = { error: "heic" | "unsupported" | "unreadable" };

/** HEIC/HEIF by the ftyp box, which file-type also reports but belt and braces. */
export function isHeic(buf: Buffer): boolean {
  if (buf.length < 12 || buf.toString("latin1", 4, 8) !== "ftyp") return false;
  const brand = buf.toString("latin1", 8, 12).toLowerCase();
  return ["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", "mif1", "msf1"].includes(brand);
}

export function newStem(): string {
  return randomBytes(16).toString("hex");
}

export async function processPhoto(input: Buffer): Promise<ProcessedPhoto | ProcessError> {
  if (isHeic(input)) return { error: "heic" };
  const type = await fileTypeFromBuffer(input);
  if (!type) return { error: "unsupported" };
  if (type.mime === "image/heic" || type.mime === "image/heif") return { error: "heic" };
  const ext = ALLOWED[type.mime];
  if (!ext) return { error: "unsupported" };

  try {
    const base = sharp(input, { failOn: "none", animated: false, limitInputPixels: 80_000_000 }).rotate();

    const normalisedPipeline = base
      .clone()
      .resize({ width: IMAGE_ORIGINAL_MAX_EDGE, height: IMAGE_ORIGINAL_MAX_EDGE, fit: "inside", withoutEnlargement: true })
      .keepIccProfile();
    const encoded =
      ext === "jpg"
        ? normalisedPipeline.jpeg({ quality: 90, mozjpeg: true })
        : ext === "webp"
          ? normalisedPipeline.webp({ quality: 90 })
          : normalisedPipeline.png(); // gif becomes a still png
    const normalisedOut = await encoded.toBuffer({ resolveWithObject: true });

    const normalised = sharp(normalisedOut.data).keepIccProfile();
    const [display, thumb, card] = await Promise.all([
      normalised
        .clone()
        .resize({ width: IMAGE_DISPLAY_MAX_EDGE, height: IMAGE_DISPLAY_MAX_EDGE, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer(),
      normalised.clone().resize({ width: IMAGE_THUMB_WIDTH, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer(),
      normalised
        .clone()
        .resize({ width: IMAGE_CARD_MAX_EDGE, height: IMAGE_CARD_MAX_EDGE, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 85, mozjpeg: true })
        .toBuffer(),
    ]);

    return {
      stem: newStem(),
      source: { contentType: type.mime, ext },
      display: { data: display, contentType: "image/webp", ext: "webp" },
      thumb: { data: thumb, contentType: "image/webp", ext: "webp" },
      card: { data: card, contentType: "image/jpeg", ext: "jpg" },
      width: normalisedOut.info.width,
      height: normalisedOut.info.height,
      bytes: display.length + thumb.length + card.length,
      sha256: createHash("sha256").update(normalisedOut.data).digest("hex"),
    };
  } catch {
    return { error: "unreadable" };
  }
}

/** The three pathnames under listings/<id>/ for a stem. */
export function mediaPaths(listingId: number, p: { stem: string }) {
  const dir = `listings/${listingId}`;
  return {
    display: `${dir}/${p.stem}_display.webp`,
    thumb: `${dir}/${p.stem}_thumb.webp`,
    card: `${dir}/${p.stem}_card.jpg`,
  };
}
