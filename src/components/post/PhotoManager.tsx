"use client";

import { upload } from "@vercel/blob/client";
import { ChevronLeft, ChevronRight, ImagePlus, Star, X } from "lucide-react";
import { type Ref, useEffect, useImperativeHandle, useRef, useState } from "react";
import { LIMITS } from "@/config/site";
import { heicToJpeg, isHeicFile } from "@/lib/heic";
import { attachPhoto, deletePhotoAction, movePhotoAction, setCoverAction } from "@/server/actions/post";
import type { PhotoRow } from "@/server/data/my-listing";

interface QueueItem {
  name: string;
  state: "waiting" | "converting" | "uploading" | "processing" | "done" | "failed";
  error?: string;
}

/** A photo picked before the listing exists: held in the browser, uploaded when the listing is posted. */
interface PendingPhoto {
  key: string;
  file: File;
  url: string;
}

/** What the post editor calls once a new listing has been saved. */
export interface PhotoManagerHandle {
  /** Upload the photos picked so far, in their order, to the new listing; resolves with how many were added. */
  uploadPending(listingId: number): Promise<number>;
}

/**
 * A listing's photos. The first is the cover on the card; ← → reorder, the
 * star makes one the cover, × deletes. New photos upload one at a time: HEIC
 * is converted in the browser first, the raw file goes to the private store
 * (or local disk in development), then attachPhoto() processes and records it.
 *
 * Before the listing exists, photos are picked and arranged here but stay in
 * the browser; the post editor hands over the new listing's id after the
 * first save and they upload then. Nothing reaches storage for a post that is
 * never made, and no draft listing is needed.
 */
export function PhotoManager({
  listingId: savedListingId,
  initial,
  uploadMode,
  ref,
  onPendingChange,
}: {
  listingId: number | null;
  initial: PhotoRow[];
  uploadMode: "blob" | "local";
  ref?: Ref<PhotoManagerHandle>;
  /** How many photos are held for a post not yet made, whenever that changes. */
  onPendingChange?: (count: number) => void;
}) {
  const [listingId, setListingId] = useState<number | null>(savedListingId);
  const [photos, setPhotos] = useState<PhotoRow[]>(initial);
  const [pending, setPending] = useState<PendingPhoto[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const working = useRef(false);
  const previews = useRef(new Set<string>());

  // The page re-renders with the saved listing after the first post.
  if (savedListingId !== null && listingId === null) setListingId(savedListingId);

  useEffect(() => {
    onPendingChange?.(pending.length);
  }, [pending.length, onPendingChange]);

  useEffect(() => {
    const urls = previews.current;
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  const room = LIMITS.photosPerListing - (listingId ? photos.length : pending.length);

  function pick(files: FileList | File[]): File[] | null {
    const list = [...files].filter((f) => f.type.startsWith("image/") || isHeicFile(f)).slice(0, Math.max(0, room));
    if (list.length === 0) {
      setNote(room <= 0 ? `A listing can have up to ${LIMITS.photosPerListing} photos.` : "Those weren’t photos.");
      return null;
    }
    return list;
  }

  function resetInput() {
    if (input.current) input.current.value = "";
  }

  async function addFiles(files: FileList | File[]) {
    if (working.current) return;
    const list = pick(files);
    if (!list) return resetInput();
    if (listingId) await uploadFiles(list);
    else await holdFiles(list);
    resetInput();
  }

  /** Before the first save: convert HEIC so it can be previewed, and keep the files in order. */
  async function holdFiles(list: File[]) {
    working.current = true;
    setBusy(true);
    setNote(list.some(isHeicFile) ? "Converting…" : null);
    const held: PendingPhoto[] = [];
    const failed: string[] = [];
    for (const original of list) {
      try {
        const file = isHeicFile(original) ? await heicToJpeg(original) : original;
        if (file.size > LIMITS.uploadMaxBytes) throw new Error("too big");
        const url = URL.createObjectURL(file);
        previews.current.add(url);
        held.push({ key: `${Date.now()}-${held.length}-${file.name}`, file, url });
      } catch {
        failed.push(original.name);
      }
    }
    setPending((p) => [...p, ...held]);
    setNote(failed.length ? `Couldn’t use ${failed.join(", ")}. Photos can be up to 30 MB.` : null);
    working.current = false;
    setBusy(false);
  }

  /** Upload each file, one at a time, to the saved listing. */
  async function uploadFiles(list: File[]): Promise<number> {
    working.current = true;
    setBusy(true);
    setNote(null);
    setQueue(list.map((f) => ({ name: f.name, state: "waiting" })));
    const set = (i: number, patch: Partial<QueueItem>) => setQueue((q) => q.map((it, j) => (j === i ? { ...it, ...patch } : it)));
    let added = 0;

    for (const [i, original] of list.entries()) {
      try {
        let file = original;
        if (isHeicFile(file)) {
          set(i, { state: "converting" });
          file = await heicToJpeg(file);
        }
        if (file.size > LIMITS.uploadMaxBytes) throw new Error("That photo is over 30 MB.");
        set(i, { state: "uploading" });
        const ref = await uploadRaw(file, uploadMode);
        set(i, { state: "processing" });
        const r = await attachPhoto(ref);
        if (!r.ok) throw new Error(r.error);
        setPhotos(r.photos);
        set(i, { state: "done" });
        added++;
      } catch (e) {
        set(i, { state: "failed", error: e instanceof Error ? e.message : "Couldn’t add that photo." });
      }
    }
    working.current = false;
    setBusy(false);
    return added;
  }

  useImperativeHandle(
    ref,
    () => ({
      async uploadPending(id: number) {
        setListingId(id);
        const files = pending.map((p) => p.file);
        const urls = pending.map((p) => p.url);
        setPending([]);
        const added = files.length ? await uploadFiles(files) : 0;
        urls.forEach((u) => {
          URL.revokeObjectURL(u);
          previews.current.delete(u);
        });
        return added;
      },
    }),
    // uploadFiles only reads state through setters; pending is what changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pending],
  );

  function movePending(i: number, to: number) {
    setPending((p) => {
      const next = [...p];
      const [item] = next.splice(i, 1);
      next.splice(to, 0, item);
      return next;
    });
  }

  function removePending(i: number) {
    const gone = pending[i];
    URL.revokeObjectURL(gone.url);
    previews.current.delete(gone.url);
    setPending(pending.filter((_, j) => j !== i));
  }

  async function run(fn: () => Promise<{ ok: true; photos: PhotoRow[] } | { ok: false; error: string }>, okNote: string) {
    if (busy) return;
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (r.ok) {
      setPhotos(r.photos);
      setNote(okNote);
    } else setNote(r.error);
  }

  const saved = listingId !== null;
  const count = saved ? photos.length : pending.length;
  const addTile = (
    <li className={count === 0 ? "col-span-full" : ""}>
      <label
        className={`flex h-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-line bg-cream px-3 text-center text-sm font-bold text-lake hover:border-lake ${
          count === 0 ? "py-10" : "aspect-[4/3]"
        } ${busy || room <= 0 ? "cursor-not-allowed opacity-50" : ""}`}
      >
        <ImagePlus className="h-6 w-6" aria-hidden />
        {count === 0 ? "Add photos" : "Add more"}
        {count === 0 && <span className="font-normal text-ink-3">or drop them here</span>}
        <input
          ref={input}
          type="file"
          accept="image/*,.heic,.heif"
          multiple
          className="sr-only"
          disabled={busy || room <= 0}
          onChange={(e) => e.target.files && void addFiles(e.target.files)}
        />
      </label>
    </li>
  );

  // One section: the photos in order, with the add tile after them; drop anywhere on it.
  return (
    <div
      className="flex flex-col gap-3 rounded-xl border border-line bg-paper p-3 sm:p-4"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        void addFiles(e.dataTransfer.files);
      }}
    >
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {!saved &&
          pending.map((p, i) => (
            <PhotoTile
              key={p.key}
              src={p.url}
              index={i}
              total={pending.length}
              busy={busy}
              onDelete={() => removePending(i)}
              onMove={(dir) => movePending(i, i + dir)}
              onCover={() => movePending(i, 0)}
            />
          ))}
        {saved &&
          photos.map((p, i) => (
            <PhotoTile
              key={p.id}
              src={p.thumbUrl || p.displayUrl}
              index={i}
              total={photos.length}
              busy={busy}
              onDelete={() => {
                if (confirm("Delete this photo? It comes off your listing right away.")) {
                  void run(() => deletePhotoAction(p.id), "Photo deleted.");
                }
              }}
              onMove={(dir) => void run(() => movePhotoAction(p.id, dir), "Saved the new order.")}
              onCover={() => void run(() => setCoverAction(p.id), "Saved. That photo is your cover now.")}
            />
          ))}
        {room > 0 && addTile}
      </ul>

      {queue.length > 0 && (
        <ul className="text-xs text-ink-2" aria-live="polite">
          {queue.map((q, i) => (
            <li key={i} className={q.state === "failed" ? "text-error-ink" : ""}>
              {q.name}: {q.state === "failed" ? q.error : q.state === "done" ? "added" : `${q.state}…`}
            </li>
          ))}
        </ul>
      )}
      {note && <p className="text-sm text-ink-2">{note}</p>}

      <p className="text-xs text-ink-3">
        {!saved && count > 0 && <strong className="text-lake">{count} ready; they upload when you post. </strong>}
        {count === 0 && (
          <strong className="text-maple-ink">{saved ? "Add at least one photo and your listing goes on the board. " : "Start with a few photos. "}</strong>
        )}
        The first photo is the cover; ★ makes another one the cover, ‹ › reorder. JPEG, PNG, WebP or HEIC, up to 30 MB each,{" "}
        {LIMITS.photosPerListing} in all.
      </p>
    </div>
  );
}

/** One photo with its controls: × delete, ← → move, ★ make cover. Photo 1 is the cover. */
function PhotoTile({
  src,
  index: i,
  total,
  busy,
  onDelete,
  onMove,
  onCover,
}: {
  src: string;
  index: number;
  total: number;
  busy: boolean;
  onDelete: () => void;
  onMove: (dir: -1 | 1) => void;
  onCover: () => void;
}) {
  return (
    <li className="flex flex-col gap-1.5">
      <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-line bg-line-light">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
        {i === 0 && <span className="absolute left-1.5 top-1.5 rounded-full bg-maple px-2 py-0.5 text-xs font-bold text-paper">Cover</span>}
        <button type="button" aria-label={`Delete photo ${i + 1}`} disabled={busy} className="absolute right-1.5 top-1.5 rounded-full bg-ink/70 p-1 text-paper hover:bg-ink" onClick={onDelete}>
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div className="flex items-center justify-center gap-1">
        <button type="button" className="icon-btn" aria-label={`Move photo ${i + 1} earlier`} disabled={busy || i === 0} onClick={() => onMove(-1)}>
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          className={`icon-btn ${i === 0 ? "text-maple" : ""}`}
          aria-label={i === 0 ? "Photo 1 is the cover" : `Make photo ${i + 1} the cover`}
          disabled={busy || i === 0}
          onClick={onCover}
        >
          <Star className="h-4 w-4" aria-hidden fill={i === 0 ? "currentColor" : "none"} />
        </button>
        <button type="button" className="icon-btn" aria-label={`Move photo ${i + 1} later`} disabled={busy || i === total - 1} onClick={() => onMove(1)}>
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </li>
  );
}

/** The raw file to the private store (Blob) or to the dev route (local); returns the reference attachPhoto() takes. */
async function uploadRaw(file: File, mode: "blob" | "local"): Promise<string> {
  if (mode === "blob") {
    const result = await upload(file.name, file, { access: "private", handleUploadUrl: "/api/upload", contentType: file.type || "application/octet-stream" });
    return result.url;
  }
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  const json = (await res.json()) as { ref?: string; error?: string };
  if (!res.ok || !json.ref) throw new Error(json.error ?? "Upload failed.");
  return json.ref;
}
