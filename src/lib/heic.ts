/**
 * HEIC in the browser. The server cannot decode HEIC (sharp's prebuilt
 * libvips has no HEVC decoder), so a HEIC photo is converted to JPEG before
 * it is uploaded: Safari can draw it natively; other browsers get heic2any
 * (libheif compiled to WebAssembly), loaded only when needed.
 */

export function isHeicFile(file: File): boolean {
  return /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
}

const MAX_EDGE = 3000;

async function viaCanvas(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
  canvas.width = canvas.height = 0; // free the bitmap memory on iOS
  if (!blob) throw new Error("toBlob failed");
  return blob;
}

async function viaWasm(file: File): Promise<Blob> {
  const { default: heic2any } = await import("heic2any");
  const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
  return Array.isArray(out) ? out[0] : out;
}

/** The same photo as a JPEG File, or throws when neither path can read it. */
export async function heicToJpeg(file: File): Promise<File> {
  let blob: Blob;
  try {
    blob = await viaCanvas(file);
  } catch {
    blob = await viaWasm(file);
  }
  return new File([blob], file.name.replace(/\.hei[cf]$/i, "") + ".jpg", { type: "image/jpeg", lastModified: file.lastModified });
}
