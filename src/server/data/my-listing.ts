import { and, asc, eq, inArray, max, ne, sql } from "drizzle-orm";
import { LIMITS } from "@/config/site";
import type { DbOrTx } from "@/db";
import { listingPhotos, listings, listingSemesters, semesters, user } from "@/db/schema";
import type { ListingInput } from "@/lib/listing-input";
import type { ListingStatus } from "@/lib/options";
import { sortSemesters } from "@/lib/semesters";
import type { ProcessedPhoto } from "@/server/images/process";
import { posterColumns, shownName } from "./names";
import { setListingSemesters } from "./semesters";

/** Who is acting: the owner, or the admin acting on any listing. */
export interface Actor {
  userId: string;
  isAdmin: boolean;
}

const owned = (listingId: number, actor: Actor) =>
  actor.isAdmin ? eq(listings.id, listingId) : and(eq(listings.id, listingId), eq(listings.userId, actor.userId))!;

export interface PhotoRow {
  id: number;
  sortOrder: number;
  displayUrl: string;
  thumbUrl: string;
}

export interface MyListing {
  row: typeof listings.$inferSelect;
  photos: PhotoRow[];
  /** Every semester it runs for, in calendar order, with whether each is still open. */
  semesters: { code: string; name: string; active: boolean }[];
  ownerEmail: string;
  /** The owner's shown name (shownName in ./names), null when there is none. */
  ownerName: string | null;
}

/** The signed-in person's one listing, or null. */
export async function myListing(db: DbOrTx, userId: string): Promise<MyListing | null> {
  const [found] = await db
    .select({ row: listings, email: user.email, poster: posterColumns })
    .from(listings)
    .innerJoin(user, eq(user.id, listings.userId))
    .where(eq(listings.userId, userId))
    .limit(1);
  if (!found) return null;
  return {
    row: found.row,
    photos: await listPhotos(db, found.row.id),
    semesters: await listingSemesterRows(db, found.row.id),
    ownerEmail: found.email,
    ownerName: shownName(found.row, found.poster, found.email),
  };
}

export async function listingById(db: DbOrTx, id: number): Promise<MyListing | null> {
  const [found] = await db
    .select({ row: listings, email: user.email, poster: posterColumns })
    .from(listings)
    .innerJoin(user, eq(user.id, listings.userId))
    .where(eq(listings.id, id))
    .limit(1);
  if (!found) return null;
  return {
    row: found.row,
    photos: await listPhotos(db, id),
    semesters: await listingSemesterRows(db, id),
    ownerEmail: found.email,
    ownerName: shownName(found.row, found.poster, found.email),
  };
}

async function listingSemesterRows(db: DbOrTx, id: number) {
  const rows = await db
    .select({ code: semesters.code, name: semesters.name, active: semesters.active, sortOrder: semesters.sortOrder })
    .from(listingSemesters)
    .innerJoin(semesters, eq(semesters.code, listingSemesters.semesterCode))
    .where(eq(listingSemesters.listingId, id));
  return sortSemesters(rows).map(({ code, name, active }) => ({ code, name, active }));
}

export async function listPhotos(db: DbOrTx, listingId: number): Promise<PhotoRow[]> {
  return db
    .select({ id: listingPhotos.id, sortOrder: listingPhotos.sortOrder, displayUrl: listingPhotos.displayUrl, thumbUrl: listingPhotos.thumbUrl })
    .from(listingPhotos)
    .where(eq(listingPhotos.listingId, listingId))
    .orderBy(asc(listingPhotos.sortOrder), asc(listingPhotos.id));
}

function columns(input: ListingInput) {
  const rest: Partial<ListingInput> = { ...input };
  delete rest.semesters;
  return { ...(rest as Omit<ListingInput, "semesters">), contactEmail: input.contactEmail || null, contactPhone: input.contactPhone || null, description: input.description || null };
}

/** Create the listing (no photos yet; it is not on the board until one is added). */
export async function createListing(
  tx: DbOrTx,
  userId: string,
  input: ListingInput,
  orderedSemesters: readonly { code: string; position: number }[],
): Promise<number> {
  const [row] = await tx
    .insert(listings)
    .values({ userId, ...columns(input) })
    .returning({ id: listings.id });
  await setListingSemesters(tx, row.id, orderedSemesters);
  return row.id;
}

/** Update the owner's listing. Status is never touched by a save. */
export async function updateListing(
  tx: DbOrTx,
  listingId: number,
  actor: Actor,
  input: ListingInput,
  orderedSemesters: readonly { code: string; position: number }[],
): Promise<boolean> {
  const updated = await tx
    .update(listings)
    .set({ ...columns(input), updatedAt: new Date() })
    .where(owned(listingId, actor))
    .returning({ id: listings.id });
  if (updated.length === 0) return false;
  await setListingSemesters(tx, listingId, orderedSemesters);
  return true;
}

/** Returns true when the status actually changed. */
export async function setListingStatus(db: DbOrTx, listingId: number, actor: Actor, status: ListingStatus): Promise<boolean> {
  const rows = await db
    .update(listings)
    .set({ status, statusChangedAt: new Date() })
    .where(and(owned(listingId, actor), ne(listings.status, status)))
    .returning({ id: listings.id });
  return rows.length > 0;
}

/** Every stored file URL of a listing, for deletion from storage. */
export async function listingFileUrls(db: DbOrTx, listingId: number): Promise<string[]> {
  const rows = await db
    .select({ d: listingPhotos.displayUrl, t: listingPhotos.thumbUrl, c: listingPhotos.cardUrl })
    .from(listingPhotos)
    .where(eq(listingPhotos.listingId, listingId));
  return rows.flatMap((r) => [r.d, r.t, r.c]);
}

/** Delete the row (photos, semesters and events cascade). Returns the file URLs to remove, or null when nothing was deleted. */
export async function deleteListing(db: DbOrTx, listingId: number, actor: Actor): Promise<string[] | null> {
  const urls = await listingFileUrls(db, listingId);
  const rows = await db.delete(listings).where(owned(listingId, actor)).returning({ id: listings.id });
  return rows.length > 0 ? urls : null;
}

export class PhotoLimitError extends Error {
  constructor() {
    super(`A listing can have up to ${LIMITS.photosPerListing} photos.`);
    this.name = "PhotoLimitError";
  }
}

export async function photoCount(db: DbOrTx, listingId: number): Promise<number> {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(listingPhotos).where(eq(listingPhotos.listingId, listingId));
  return n;
}

/** Append a processed photo after the existing ones. */
export async function addPhoto(
  tx: DbOrTx,
  listingId: number,
  p: ProcessedPhoto,
  urls: { display: string; thumb: string; card: string },
): Promise<PhotoRow> {
  if ((await photoCount(tx, listingId)) >= LIMITS.photosPerListing) throw new PhotoLimitError();
  const [{ next }] = await tx.select({ next: sql<number>`coalesce(max(${listingPhotos.sortOrder}), -1)::int + 1` }).from(listingPhotos).where(eq(listingPhotos.listingId, listingId));
  const [row] = await tx
    .insert(listingPhotos)
    .values({
      listingId,
      sortOrder: next,
      stem: p.stem,
      displayUrl: urls.display,
      thumbUrl: urls.thumb,
      cardUrl: urls.card,
      width: p.width,
      height: p.height,
      bytes: p.bytes,
      contentType: p.source.contentType,
      sha256: p.sha256,
    })
    .returning({ id: listingPhotos.id, sortOrder: listingPhotos.sortOrder, displayUrl: listingPhotos.displayUrl, thumbUrl: listingPhotos.thumbUrl });
  return row;
}

/** Renumber 0..n−1 in the given order; `orderedIds` must be exactly the listing's photo ids. */
export async function renumberPhotos(tx: DbOrTx, listingId: number, orderedIds: readonly number[]): Promise<void> {
  const current = (await listPhotos(tx, listingId)).map((p) => p.id);
  if (current.length !== orderedIds.length || !current.every((id) => orderedIds.includes(id))) {
    throw new Error("photo order does not match the listing");
  }
  for (const [i, id] of orderedIds.entries()) {
    await tx.update(listingPhotos).set({ sortOrder: i }).where(and(eq(listingPhotos.id, id), eq(listingPhotos.listingId, listingId)));
  }
}

/** The listing a photo belongs to, if the actor may touch it. */
export async function photoOwner(db: DbOrTx, photoId: number, actor: Actor): Promise<number | null> {
  const [row] = await db
    .select({ listingId: listingPhotos.listingId })
    .from(listingPhotos)
    .innerJoin(listings, eq(listings.id, listingPhotos.listingId))
    .where(and(eq(listingPhotos.id, photoId), actor.isAdmin ? sql`true` : eq(listings.userId, actor.userId)))
    .limit(1);
  return row?.listingId ?? null;
}

export async function movePhoto(tx: DbOrTx, listingId: number, photoId: number, dir: -1 | 1): Promise<PhotoRow[]> {
  const ids = (await listPhotos(tx, listingId)).map((p) => p.id);
  const i = ids.indexOf(photoId);
  const j = i + dir;
  if (i === -1 || j < 0 || j >= ids.length) return listPhotos(tx, listingId);
  [ids[i], ids[j]] = [ids[j], ids[i]];
  await renumberPhotos(tx, listingId, ids);
  return listPhotos(tx, listingId);
}

export async function setCoverPhoto(tx: DbOrTx, listingId: number, photoId: number): Promise<PhotoRow[]> {
  const ids = (await listPhotos(tx, listingId)).map((p) => p.id);
  if (!ids.includes(photoId)) return listPhotos(tx, listingId);
  await renumberPhotos(tx, listingId, [photoId, ...ids.filter((id) => id !== photoId)]);
  return listPhotos(tx, listingId);
}

/** Delete one photo and renumber. Returns the file URLs to remove and the new order. */
export async function deletePhoto(tx: DbOrTx, listingId: number, photoId: number): Promise<{ urls: string[]; photos: PhotoRow[] }> {
  const [row] = await tx
    .select({ d: listingPhotos.displayUrl, t: listingPhotos.thumbUrl, c: listingPhotos.cardUrl })
    .from(listingPhotos)
    .where(and(eq(listingPhotos.id, photoId), eq(listingPhotos.listingId, listingId)));
  if (!row) return { urls: [], photos: await listPhotos(tx, listingId) };
  await tx.delete(listingPhotos).where(eq(listingPhotos.id, photoId));
  const rest = (await listPhotos(tx, listingId)).map((p) => p.id);
  await renumberPhotos(tx, listingId, rest);
  return { urls: [row.d, row.t, row.c], photos: await listPhotos(tx, listingId) };
}

/** Bulk: the file URLs of several photos the actor may delete (admin Images tab). */
export async function photoFileUrls(db: DbOrTx, photoIds: readonly number[]): Promise<Map<number, { listingId: number; urls: string[] }>> {
  const map = new Map<number, { listingId: number; urls: string[] }>();
  if (photoIds.length === 0) return map;
  const rows = await db
    .select({ id: listingPhotos.id, listingId: listingPhotos.listingId, d: listingPhotos.displayUrl, t: listingPhotos.thumbUrl, c: listingPhotos.cardUrl })
    .from(listingPhotos)
    .where(inArray(listingPhotos.id, [...photoIds]));
  for (const r of rows) map.set(r.id, { listingId: r.listingId, urls: [r.d, r.t, r.c] });
  return map;
}

export { max };
