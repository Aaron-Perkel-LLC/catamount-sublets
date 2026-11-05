import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { del, get, head, list, put } from "@vercel/blob";
import { isProductionEnv } from "@/env";
import { log } from "@/server/log";

/**
 * Where files live.
 *
 * Two Vercel Blob stores: `uploads` (private) receives raw client uploads,
 * `media` (public) holds only sharp's output. Raw uploads are read back
 * here, processed, written to media and deleted. The public store's URLs are
 * what the database stores.
 *
 * With no Blob tokens outside production, files go to `.uploads/` on disk
 * and are served by src/app/dev-uploads, so a fresh clone can post a listing
 * with photos without an account anywhere.
 */

export type StorageMode = "blob" | "local";

/** Local-mode root; tests point UPLOADS_DIR at a temporary directory. */
const LOCAL_ROOT = path.resolve(process.env.UPLOADS_DIR ?? ".uploads");
const LOCAL_URL_PREFIX = "/dev-uploads";

export function storageMode(): StorageMode {
  if (process.env.BLOB_MEDIA_READ_WRITE_TOKEN && process.env.BLOB_UPLOADS_READ_WRITE_TOKEN) return "blob";
  if (isProductionEnv()) throw new Error("Blob tokens are not set in production");
  return "local";
}

const mediaToken = () => process.env.BLOB_MEDIA_READ_WRITE_TOKEN;
const uploadsToken = () => process.env.BLOB_UPLOADS_READ_WRITE_TOKEN;

/** Write a processed file to the public media store. Returns its URL. Overwrite is for the migration's re-runs only. */
export async function putMedia(pathname: string, data: Buffer, contentType: string, options: { overwrite?: boolean } = {}): Promise<string> {
  if (storageMode() === "blob") {
    const result = await put(pathname, data, {
      access: "public",
      token: mediaToken(),
      contentType,
      addRandomSuffix: false,
      allowOverwrite: options.overwrite === true,
      cacheControlMaxAge: 31_536_000,
    });
    return result.url;
  }
  const file = path.join(LOCAL_ROOT, "media", pathname);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, data);
  return `${LOCAL_URL_PREFIX}/media/${pathname}`;
}

/**
 * Write a processed file unless an identical-sized one is already there.
 * Writes are metered; a head() is not. The migration's re-runs and the
 * cutover sync rely on this so files uploaded during a rehearsal are kept.
 */
export async function putMediaIfAbsent(pathname: string, data: Buffer, contentType: string): Promise<{ url: string; reused: boolean }> {
  if (storageMode() === "blob") {
    try {
      const existing = await head(pathname, { token: mediaToken() });
      if (existing.size === data.length) return { url: existing.url, reused: true };
    } catch {
      // not there (BlobNotFoundError) or unreachable: write it
    }
    return { url: await putMedia(pathname, data, contentType, { overwrite: true }), reused: false };
  }
  const file = path.join(LOCAL_ROOT, "media", pathname);
  try {
    if ((await stat(file)).size === data.length) return { url: `${LOCAL_URL_PREFIX}/media/${pathname}`, reused: true };
  } catch {
    // absent
  }
  return { url: await putMedia(pathname, data, contentType, { overwrite: true }), reused: false };
}

/** Delete processed files by URL. A missing file is not an error. */
export async function deleteMedia(urls: readonly string[]): Promise<void> {
  const list = urls.filter((u) => u && !u.startsWith("/seed/"));
  if (list.length === 0) return;
  if (storageMode() === "blob") {
    try {
      await del(list, { token: mediaToken() });
    } catch (error) {
      log.error("storage.delete_failed", error, { count: list.length });
    }
    return;
  }
  for (const u of list) {
    if (!u.startsWith(`${LOCAL_URL_PREFIX}/media/`)) continue;
    await rm(path.join(LOCAL_ROOT, "media", u.slice(`${LOCAL_URL_PREFIX}/media/`.length)), { force: true });
  }
}

/**
 * A raw upload, by the reference the client got back: a private Blob URL,
 * or in local mode the id of a file under .uploads/raw/.
 */
export async function readRawUpload(ref: string): Promise<Buffer | null> {
  if (storageMode() === "blob") {
    const result = await get(ref, { access: "private", token: uploadsToken(), useCache: false });
    if (!result?.stream) return null;
    return Buffer.from(await new Response(result.stream).arrayBuffer());
  }
  if (!/^[a-f0-9]{32}$/.test(ref)) return null;
  try {
    return await readFile(path.join(LOCAL_ROOT, "raw", ref));
  } catch {
    return null;
  }
}

export async function deleteRawUpload(ref: string): Promise<void> {
  try {
    if (storageMode() === "blob") await del(ref, { token: uploadsToken() });
    else if (/^[a-f0-9]{32}$/.test(ref)) await rm(path.join(LOCAL_ROOT, "raw", ref), { force: true });
  } catch (error) {
    log.warn("storage.raw_delete_failed", { message: error instanceof Error ? error.message : String(error) });
  }
}

/** Local mode only: save a raw upload and return its id. */
export async function saveRawUploadLocal(data: Buffer): Promise<string> {
  const id = randomBytes(16).toString("hex");
  await mkdir(path.join(LOCAL_ROOT, "raw"), { recursive: true });
  await writeFile(path.join(LOCAL_ROOT, "raw", id), data);
  return id;
}

/** Local mode only: read a served media file. */
export async function readLocalMedia(relative: string): Promise<Buffer | null> {
  const file = path.join(LOCAL_ROOT, "media", relative);
  if (!file.startsWith(path.join(LOCAL_ROOT, "media") + path.sep)) return null;
  try {
    return await readFile(file);
  } catch {
    return null;
  }
}

export interface StoredFile {
  url: string;
  pathname: string;
  size: number;
  uploadedAt: Date;
}

/** Every processed file in the public store (the admin's orphan sweep). */
export async function listMediaFiles(): Promise<StoredFile[]> {
  if (storageMode() === "blob") {
    const out: StoredFile[] = [];
    let cursor: string | undefined;
    do {
      const page = await list({ token: mediaToken(), prefix: "listings/", cursor, limit: 1000 });
      for (const b of page.blobs) out.push({ url: b.url, pathname: b.pathname, size: b.size, uploadedAt: b.uploadedAt });
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return out;
  }
  const root = path.join(LOCAL_ROOT, "media");
  const out: StoredFile[] = [];
  const walk = async (dir: string) => {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else {
        const st = await stat(full);
        const rel = path.relative(root, full).split(path.sep).join("/");
        out.push({ url: `${LOCAL_URL_PREFIX}/media/${rel}`, pathname: rel, size: st.size, uploadedAt: st.mtime });
      }
    }
  };
  await walk(path.join(root, "listings"));
  return out;
}

/** Raw uploads still in the private store, with their age (the cron's sweep). */
export async function listRawUploads(): Promise<{ ref: string; uploadedAt: Date }[]> {
  if (storageMode() === "blob") {
    const out: { ref: string; uploadedAt: Date }[] = [];
    let cursor: string | undefined;
    do {
      const page = await list({ token: uploadsToken(), prefix: "raw/", cursor, limit: 1000 });
      for (const b of page.blobs) out.push({ ref: b.url, uploadedAt: b.uploadedAt });
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return out;
  }
  try {
    const dir = path.join(LOCAL_ROOT, "raw");
    const names = await readdir(dir);
    return Promise.all(names.map(async (n) => ({ ref: n, uploadedAt: (await stat(path.join(dir, n))).mtime })));
  } catch {
    return [];
  }
}

/** Whether a stored URL points at our public store (for cleanup safety). */
export function isMediaUrl(url: string): boolean {
  return url.startsWith(`${LOCAL_URL_PREFIX}/media/`) || /^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\//.test(url);
}
