import { z } from "zod";
import type { Db } from "@/db";
import { formToListingInput, validateListingInput } from "@/lib/listing-input";
import { LISTING_STATUS_VALUES, type ListingStatus } from "@/lib/options";
import {
  addPhoto,
  createListing,
  deleteListing,
  deletePhoto,
  listPhotos,
  movePhoto,
  myListing,
  PhotoLimitError,
  photoOwner,
  setCoverPhoto,
  setListingStatus,
  updateListing,
  type PhotoRow,
} from "@/server/data/my-listing";
import { activeSemesters, SemesterChoiceError, validateSemesterChoice } from "@/server/data/semesters";
import { assertWritable, ReadOnlyError } from "@/server/data/settings";
import { RATE_LIMITS, takeRateLimit } from "@/server/rate-limit";
import { listingSnapshot, noticeCreated, noticeDeleted, noticeStatus, noticeUpdated } from "@/server/email/notices";
import { mediaPaths, processPhoto } from "@/server/images/process";
import { log } from "@/server/log";
import { deleteMedia, deleteRawUpload, putMedia, readRawUpload } from "@/server/storage";

/**
 * What the post form's Server Actions do, without the request: the actions
 * in src/server/actions/post.ts authenticate, call these, and revalidate.
 * Testable on PGlite with local storage.
 */

export interface ServiceUser {
  id: string;
  email: string;
  role: "user" | "admin";
}

export interface SaveState {
  ok: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
  created?: boolean;
  listingId?: number;
}

export type AttachResult = { ok: true; photo: PhotoRow; photos: PhotoRow[] } | { ok: false; error: string };
export type PhotosResult = { ok: true; photos: PhotoRow[] } | { ok: false; error: string };
export type PhotoOp = { kind: "move"; dir: -1 | 1 } | { kind: "cover" } | { kind: "delete" };

export function friendlyError(error: unknown): string {
  if (error instanceof ReadOnlyError || error instanceof SemesterChoiceError || error instanceof PhotoLimitError) return error.message;
  log.error("listing.service_failed", error);
  return "Something went wrong saving that. Try again in a moment.";
}

/** Create or update the person's one listing. Status is never changed by a save. */
export async function saveListingFor(db: Db, user: ServiceUser, formData: FormData): Promise<SaveState> {
  try {
    await assertWritable(db);
    const parsed = validateListingInput(formToListingInput(formData));
    if (!parsed.ok) return { ok: false, fieldErrors: parsed.fieldErrors, error: "Check the fields marked below." };
    const input = parsed.data;

    const existing = await myListing(db, user.id);
    // Offered: the open semesters, plus closed ones the listing already has, so a save never silently drops one.
    const offered = [...(await activeSemesters(db)), ...(existing?.semesters.filter((s) => !s.active) ?? [])];
    const ordered = validateSemesterChoice(input.semesters, offered);

    if (existing) {
      const before = await listingSnapshot(db, existing.row.id);
      await db.transaction(async (tx) => {
        await updateListing(tx, existing.row.id, { userId: user.id, isAdmin: false }, input, ordered);
      });
      const after = await listingSnapshot(db, existing.row.id);
      if (before && after) await noticeUpdated(before, after);
      const status = existing.row.status as ListingStatus;
      const note = status === "paused" ? " It is still paused, so it is not on the board." : status === "taken" ? " It is still marked as taken." : "";
      return { ok: true, listingId: existing.row.id, message: `Saved.${note}` };
    }

    const quota = await takeRateLimit(db, RATE_LIMITS.listingCreatePerUser, user.id);
    if (!quota.allowed) return { ok: false, error: "You have posted and removed a listing several times today. Try again tomorrow." };
    const id = await db.transaction((tx) => createListing(tx, user.id, input, ordered));
    const snap = await listingSnapshot(db, id);
    if (snap) await noticeCreated(snap);
    return { ok: true, created: true, listingId: id, message: "Posted. Add at least one photo and your listing goes on the board." };
  } catch (error) {
    return { ok: false, error: friendlyError(error) };
  }
}

export async function setStatusFor(db: Db, user: ServiceUser, status: ListingStatus): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertWritable(db);
    z.enum(LISTING_STATUS_VALUES).parse(status);
    const mine = await myListing(db, user.id);
    if (!mine) return { ok: false, error: "You don't have a listing yet." };
    const changed = await setListingStatus(db, mine.row.id, { userId: user.id, isAdmin: false }, status);
    if (changed) {
      const snap = await listingSnapshot(db, mine.row.id);
      if (snap) await noticeStatus(snap, status, "poster");
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: friendlyError(error) };
  }
}

/** Delete the person's listing and its files. */
export async function deleteListingFor(db: Db, user: ServiceUser): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertWritable(db);
    const mine = await myListing(db, user.id);
    if (!mine) return { ok: false, error: "You don't have a listing." };
    const snap = await listingSnapshot(db, mine.row.id);
    const urls = await deleteListing(db, mine.row.id, { userId: user.id, isAdmin: false });
    if (urls) {
      await deleteMedia(urls);
      if (snap) await noticeDeleted(snap, "poster");
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: friendlyError(error) };
  }
}

const PROCESS_ERRORS = {
  heic: "That's a HEIC photo, which this browser couldn't convert. Save it as a JPEG first, or add it in Safari.",
  unsupported: "That file isn't a photo we can use. JPEG, PNG, WebP or GIF, please.",
  unreadable: "That photo couldn't be read. Try a different file.",
} as const;

/**
 * A raw upload becomes the listing's next photo: sniffed, processed by sharp,
 * written to the public store, recorded. The raw file is deleted whatever happens.
 */
export async function attachPhotoFor(db: Db, user: ServiceUser, ref: string): Promise<AttachResult> {
  try {
    await assertWritable(db);
    z.string().min(1).max(500).parse(ref);
    const mine = await myListing(db, user.id);
    if (!mine) return { ok: false, error: "Save the listing first, then add photos." };
    const raw = await readRawUpload(ref);
    if (!raw) return { ok: false, error: "That upload didn't arrive. Try adding the photo again." };
    const processed = await processPhoto(raw);
    if ("error" in processed) return { ok: false, error: PROCESS_ERRORS[processed.error] };
    const paths = mediaPaths(mine.row.id, processed);
    const [display, thumb, card] = await Promise.all([
      putMedia(paths.display, processed.display.data, processed.display.contentType),
      putMedia(paths.thumb, processed.thumb.data, processed.thumb.contentType),
      putMedia(paths.card, processed.card.data, processed.card.contentType),
    ]);
    try {
      const photo = await db.transaction((tx) => addPhoto(tx, mine.row.id, processed, { display, thumb, card }));
      return { ok: true, photo, photos: await listPhotos(db, mine.row.id) };
    } catch (error) {
      await deleteMedia([display, thumb, card]);
      throw error;
    }
  } catch (error) {
    return { ok: false, error: friendlyError(error) };
  } finally {
    await deleteRawUpload(ref);
  }
}

/** Move, make cover, or delete one of the person's photos (or any, for the admin). */
export async function photoOpFor(db: Db, user: ServiceUser, photoId: number, op: PhotoOp): Promise<PhotosResult> {
  try {
    await assertWritable(db);
    z.number().int().positive().parse(photoId);
    const listingId = await photoOwner(db, photoId, { userId: user.id, isAdmin: user.role === "admin" });
    if (!listingId) return { ok: false, error: "That photo isn't yours to change." };
    let photos: PhotoRow[];
    if (op.kind === "move") photos = await db.transaction((tx) => movePhoto(tx, listingId, photoId, op.dir));
    else if (op.kind === "cover") photos = await db.transaction((tx) => setCoverPhoto(tx, listingId, photoId));
    else {
      const r = await db.transaction((tx) => deletePhoto(tx, listingId, photoId));
      await deleteMedia(r.urls);
      photos = r.photos;
    }
    return { ok: true, photos };
  } catch (error) {
    return { ok: false, error: friendlyError(error) };
  }
}
