import { and, asc, count, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import { listingEvents, listingPhotos, listings, listingSemesters, semesterArchives, semesters, session, user } from "@/db/schema";
import { LISTING_STATUS_VALUES, type ListingStatus } from "@/lib/options";
import { posterFirstName } from "@/lib/person-name";
import { orderSemesterCodes, sortSemesters } from "@/lib/semesters";
import { listingActivity } from "@/server/data/events";
import { deleteListing, listingFileUrls, photoFileUrls, setListingStatus } from "@/server/data/my-listing";
import { posterColumns, shownName } from "@/server/data/names";
import { listingCountForSemester, setListingSemesters } from "@/server/data/semesters";
import { listingSnapshot, noticeDeleted, noticeStatus } from "@/server/email/notices";
import { sendBroadcast, type Recipient } from "@/server/email/broadcast";
import { log } from "@/server/log";
import { deleteMedia, deleteRawUpload, isMediaUrl, listMediaFiles, listRawUploads } from "@/server/storage";
import { publicListingWhere, visibleSemesterWhere } from "@/server/data/visibility";

/** The admin's operations, without the request. src/server/actions/admin.ts authenticates and calls these. */

export type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
const ok = <T>(data: T): Result<T> => ({ ok: true, data });
const fail = <T = undefined>(error: string): Result<T> => ({ ok: false, error });

/* ------------------------------------------------------------ semesters */

const semesterInput = z.object({
  code: z.string().trim().regex(/^[a-z]+[0-9]{2}$/, "Codes look like spring27."),
  name: z.string().trim().min(1, "Enter the name.").max(50),
});

export async function addSemester(db: Db, raw: { code: string; name: string }): Promise<Result> {
  const parsed = semesterInput.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the semester.");
  const [exists] = await db.select({ code: semesters.code }).from(semesters).where(eq(semesters.code, parsed.data.code));
  if (exists) return fail("That code already exists.");
  const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${semesters.sortOrder}), 0)::int` }).from(semesters);
  await db.insert(semesters).values({ ...parsed.data, sortOrder: max + 1 });
  return ok(undefined);
}

/** Deactivating hides every listing that runs only for it; nothing is deleted. */
export async function toggleSemester(db: Db, code: string): Promise<Result<{ active: boolean }>> {
  const [row] = await db.select().from(semesters).where(eq(semesters.code, code));
  if (!row) return fail("No such semester.");
  if (row.archivedAt) return fail("An archived semester cannot be reactivated.");
  await db.update(semesters).set({ active: !row.active }).where(eq(semesters.code, code));
  return ok({ active: !row.active });
}

export async function deleteSemester(db: Db, code: string): Promise<Result> {
  const [row] = await db.select().from(semesters).where(eq(semesters.code, code));
  if (!row) return fail("No such semester.");
  const n = await listingCountForSemester(db, code);
  if (n > 0) return fail(`${n} listing${n === 1 ? " runs" : "s run"} for it. Archive it instead.`);
  await db.delete(semesters).where(eq(semesters.code, code));
  return ok(undefined);
}

/* -------------------------------------------------------------- archive */

export interface ArchivePlan {
  code: string;
  name: string;
  blocking: string[];
  going: { id: number; status: string; price: number; photos: number; bytes: number; ownerEmail: string; ownerName: string | null; address: string }[];
  staying: { id: number; ownerEmail: string; ownerName: string | null; address: string; nextSemester: string }[];
  totals: { listings: number; taken: number; photos: number; bytes: number; priceMedian: number | null; priceMin: number | null; priceMax: number | null; views: number; contacts: number; shares: number; shareArrivals: number; events: number };
}

/**
 * The dry run. A listing that also runs for a semester that is not archived
 * stays: it loses only this semester, keeps its photos, and its activity is
 * re-tagged to its next semester. Everything else goes, photos included.
 */
export async function archivePlan(db: Db, code: string): Promise<ArchivePlan> {
  const [sem] = await db.select().from(semesters).where(eq(semesters.code, code));
  const blocking: string[] = [];
  if (!sem) return { code, name: code, blocking: ["No such semester."], going: [], staying: [], totals: emptyTotals() };
  if (sem.active) blocking.push("The semester is still active. Deactivate it first.");
  if (sem.archivedAt) blocking.push("Already archived.");

  const rows = (
    await db
      .select({ id: listings.id, status: listings.status, price: listings.price, address: listings.address, displayName: listings.displayName, ownerEmail: user.email, poster: posterColumns })
      .from(listingSemesters)
      .innerJoin(listings, eq(listings.id, listingSemesters.listingId))
      .innerJoin(user, eq(user.id, listings.userId))
      .where(eq(listingSemesters.semesterCode, code))
      .orderBy(asc(listings.id))
  ).map(({ displayName, poster, ...r }) => ({ ...r, ownerName: shownName({ displayName }, poster, r.ownerEmail) }));
  const ids = rows.map((r) => r.id);
  const others = ids.length
    ? await db
        .select({ listingId: listingSemesters.listingId, code: semesters.code, name: semesters.name, archivedAt: semesters.archivedAt, sortOrder: semesters.sortOrder })
        .from(listingSemesters)
        .innerJoin(semesters, eq(semesters.code, listingSemesters.semesterCode))
        .where(and(inArray(listingSemesters.listingId, ids), ne(listingSemesters.semesterCode, code)))
    : [];
  const stayNext = new Map<number, string>();
  for (const o of others) if (!o.archivedAt && !stayNext.has(o.listingId)) stayNext.set(o.listingId, o.name);

  const going = rows.filter((r) => !stayNext.has(r.id));
  const staying = rows.filter((r) => stayNext.has(r.id)).map((r) => ({ id: r.id, ownerEmail: r.ownerEmail, ownerName: r.ownerName, address: r.address, nextSemester: stayNext.get(r.id)! }));
  const goingIds = going.map((g) => g.id);
  const photoStats = goingIds.length
    ? await db
        .select({ listingId: listingPhotos.listingId, n: count(), bytes: sql<number>`coalesce(sum(${listingPhotos.bytes}), 0)::bigint` })
        .from(listingPhotos)
        .where(inArray(listingPhotos.listingId, goingIds))
        .groupBy(listingPhotos.listingId)
    : [];
  const photosBy = new Map(photoStats.map((p) => [p.listingId, { n: Number(p.n), bytes: Number(p.bytes) }]));

  const activity = await listingActivity(db, "all");
  const prices = going.map((g) => g.price).sort((a, b) => a - b);
  const median = prices.length ? (prices.length % 2 ? prices[(prices.length - 1) / 2] : (prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2) : null;
  const [{ events }] = goingIds.length
    ? await db.select({ events: count() }).from(listingEvents).where(sql`${listingEvents.listingId} in (${sql.join(goingIds.map((i) => sql`${i}`), sql`, `)}) or ${listingEvents.semesterCode} = ${code}`)
    : [{ events: 0 }];

  const totals = going.reduce(
    (t, g) => {
      const a = activity.get(g.id);
      const p = photosBy.get(g.id);
      return {
        ...t,
        listings: t.listings + 1,
        taken: t.taken + (g.status === "taken" ? 1 : 0),
        photos: t.photos + (p?.n ?? 0),
        bytes: t.bytes + (p?.bytes ?? 0),
        views: t.views + (a?.views ?? 0),
        contacts: t.contacts + (a?.contacts ?? 0),
        shares: t.shares + (a?.shares ?? 0),
        shareArrivals: t.shareArrivals + (a?.arrivals ?? 0),
      };
    },
    { ...emptyTotals(), priceMedian: median, priceMin: prices[0] ?? null, priceMax: prices.at(-1) ?? null, events: Number(events) },
  );
  return {
    code,
    name: sem.name,
    blocking,
    going: going.map((g) => ({ ...g, photos: photosBy.get(g.id)?.n ?? 0, bytes: photosBy.get(g.id)?.bytes ?? 0 })),
    staying,
    totals,
  };
}

const emptyTotals = (): ArchivePlan["totals"] => ({ listings: 0, taken: 0, photos: 0, bytes: 0, priceMedian: null, priceMin: null, priceMax: null, views: 0, contacts: 0, shares: 0, shareArrivals: 0, events: 0 });

/**
 * The archive. One transaction under an advisory lock: re-plans, refuses
 * if anything changed, writes the totals row with a manifest of what is
 * about to go, takes the semester off the staying listings (their next
 * semester becomes first and their events are re-tagged), deletes the going
 * listings (photos, semesters and events cascade) and stamps the semester.
 * Files are deleted from storage only after the commit.
 */
export async function archiveCommit(db: Db, code: string, confirm: string): Promise<Result<{ listings: number; filesDeleted: number }>> {
  if (confirm !== code) return fail("Type the semester code to confirm.");
  const before = await archivePlan(db, code);
  if (before.blocking.length) return fail(before.blocking.join(" "));
  try {
    const urls = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('archive'))`);
      const plan = await archivePlan(tx as unknown as Db, code);
      if (plan.blocking.length) throw new Error(plan.blocking.join(" "));
      if (JSON.stringify(plan.going.map((g) => g.id)) !== JSON.stringify(before.going.map((g) => g.id))) throw new Error("The listings changed since the preview. Preview again.");
      const goingIds = plan.going.map((g) => g.id);
      const fileUrls = (await Promise.all(goingIds.map((id) => listingFileUrls(tx, id)))).flat();
      const stems = goingIds.length
        ? await tx.select({ listingId: listingPhotos.listingId, stem: listingPhotos.stem, bytes: listingPhotos.bytes }).from(listingPhotos).where(inArray(listingPhotos.listingId, goingIds))
        : [];
      const manifest: Record<string, { stems: string[]; bytes: number }> = {};
      for (const s of stems) {
        const m = (manifest[String(s.listingId)] ??= { stems: [], bytes: 0 });
        m.stems.push(s.stem);
        m.bytes += s.bytes ?? 0;
      }
      await tx.insert(semesterArchives).values({
        semesterCode: code,
        semesterName: plan.name,
        listings: plan.totals.listings,
        taken: plan.totals.taken,
        priceMedian: plan.totals.priceMedian,
        priceMin: plan.totals.priceMin,
        priceMax: plan.totals.priceMax,
        views: plan.totals.views,
        contacts: plan.totals.contacts,
        shares: plan.totals.shares,
        shareArrivals: plan.totals.shareArrivals,
        photos: plan.totals.photos,
        bytes: plan.totals.bytes,
        manifest: { listings: manifest },
      });
      for (const stay of plan.staying) {
        const rest = await tx
          .select({ code: semesters.code, name: semesters.name, sortOrder: semesters.sortOrder })
          .from(listingSemesters)
          .innerJoin(semesters, eq(semesters.code, listingSemesters.semesterCode))
          .where(and(eq(listingSemesters.listingId, stay.id), ne(listingSemesters.semesterCode, code)));
        const ordered = orderSemesterCodes(rest);
        await setListingSemesters(tx, stay.id, ordered);
        await tx.update(listingEvents).set({ semesterCode: ordered[0]?.code ?? null }).where(and(eq(listingEvents.listingId, stay.id), eq(listingEvents.semesterCode, code)));
      }
      if (goingIds.length) await tx.delete(listings).where(inArray(listings.id, goingIds));
      await tx.delete(listingEvents).where(eq(listingEvents.semesterCode, code));
      await tx.update(semesters).set({ archivedAt: new Date() }).where(eq(semesters.code, code));
      return fileUrls;
    });
    await deleteMedia(urls);
    return ok({ listings: before.going.length, filesDeleted: urls.length });
  } catch (error) {
    log.error("archive.failed", error, { code });
    return fail(error instanceof Error ? error.message : "The archive failed; nothing was removed.");
  }
}

export async function archiveHistory(db: Db) {
  return db.select().from(semesterArchives).orderBy(desc(semesterArchives.archivedAt));
}

/* ---------------------------------------------------------------- posts */

export async function adminSetStatus(db: Db, listingId: number, status: ListingStatus): Promise<Result> {
  if (!(LISTING_STATUS_VALUES as readonly string[]).includes(status)) return fail("Bad status.");
  const changed = await setListingStatus(db, listingId, { userId: "", isAdmin: true }, status);
  if (changed) {
    const snap = await listingSnapshot(db, listingId);
    if (snap) await noticeStatus(snap, status, "admin");
  }
  return ok(undefined);
}

export async function adminDeleteListing(db: Db, listingId: number): Promise<Result> {
  const snap = await listingSnapshot(db, listingId);
  const urls = await deleteListing(db, listingId, { userId: "", isAdmin: true });
  if (!urls) return fail("No such listing.");
  await deleteMedia(urls);
  if (snap) await noticeDeleted(snap, "admin");
  return ok(undefined);
}

/* --------------------------------------------------------------- people */

export interface Person {
  id: string;
  email: string;
  /** Their shown name (shownName in src/server/data/names.ts), null when there is none. */
  name: string | null;
  role: string;
  banned: boolean;
  banReason: string | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  legacyNetid: string | null;
  listingId: number | null;
}

export async function listPeople(db: Db): Promise<Person[]> {
  const rows = await db
    .select({ u: user, listingId: listings.id, displayName: listings.displayName })
    .from(user)
    .leftJoin(listings, eq(listings.userId, user.id))
    .orderBy(desc(user.lastLoginAt), asc(user.email));
  return rows.map(({ u, listingId, displayName }) => ({
    id: u.id,
    email: u.email,
    name: shownName({ displayName }, u, u.email),
    role: u.role ?? "user",
    banned: Boolean(u.banned),
    banReason: u.banReason ?? null,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
    legacyNetid: u.legacyNetid,
    listingId,
  }));
}

/** Ban: refuses sign-in from now on and ends every session. */
export async function setBanned(db: Db, userId: string, banned: boolean, reason: string | null, actingAdminId: string): Promise<Result> {
  if (userId === actingAdminId) return fail("You can't ban yourself.");
  const [u] = await db.select({ role: user.role }).from(user).where(eq(user.id, userId));
  if (!u) return fail("No such person.");
  if (u.role === "admin") return fail("Admins can't be banned.");
  await db.update(user).set({ banned, banReason: banned ? reason?.trim() || "Banned by the admin." : null, banExpires: null }).where(eq(user.id, userId));
  if (banned) await db.delete(session).where(eq(session.userId, userId));
  return ok(undefined);
}

export interface DeletionReport {
  email: string;
  listingId: number | null;
  photos: number;
  files: number;
  events: number;
  sessions: number;
}

/**
 * Delete a person entirely: their listing (photos, semesters, events
 * cascade), their sessions, and their files from storage. Used by the
 * People tab, the account page, and the delete-user script.
 */
export async function deletePerson(db: Db, userId: string, actingAdminId: string | null, dryRun = false): Promise<Result<DeletionReport>> {
  if (actingAdminId && userId === actingAdminId) return fail("You can't delete yourself from here.");
  const [u] = await db.select({ email: user.email, role: user.role }).from(user).where(eq(user.id, userId));
  if (!u) return fail("No such person.");
  if (actingAdminId && u.role === "admin") return fail("Admins can't be deleted from here.");
  const [l] = await db.select({ id: listings.id }).from(listings).where(eq(listings.userId, userId));
  const urls = l ? await listingFileUrls(db, l.id) : [];
  const [{ events }] = l ? await db.select({ events: count() }).from(listingEvents).where(eq(listingEvents.listingId, l.id)) : [{ events: 0 }];
  const [{ sessions }] = await db.select({ sessions: count() }).from(session).where(eq(session.userId, userId));
  const report: DeletionReport = { email: u.email, listingId: l?.id ?? null, photos: urls.length / 3, files: urls.length, events: Number(events), sessions: Number(sessions) };
  if (dryRun) return ok(report);
  await db.delete(user).where(eq(user.id, userId));
  await deleteMedia(urls);
  return ok(report);
}

/* --------------------------------------------------------------- images */

export interface OrphanReport {
  media: { url: string; pathname: string; size: number; uploadedAt: Date }[];
  rawUploads: { ref: string; uploadedAt: Date }[];
  missing: { photoId: number; listingId: number; url: string }[];
  referenced: number;
}

/** Files in storage that no photo row names, and photo rows whose file is gone. */
export async function orphanReport(db: Db, checkMissing = false): Promise<OrphanReport> {
  const rows = await db.select({ id: listingPhotos.id, listingId: listingPhotos.listingId, d: listingPhotos.displayUrl, t: listingPhotos.thumbUrl, c: listingPhotos.cardUrl }).from(listingPhotos);
  const referenced = new Set(rows.flatMap((r) => [r.d, r.t, r.c]));
  const files = await listMediaFiles();
  const media = files.filter((f) => !referenced.has(f.url));
  const dayAgo = Date.now() - 86_400_000;
  const rawUploads = (await listRawUploads()).filter((r) => r.uploadedAt.getTime() < dayAgo);
  const missing: OrphanReport["missing"] = [];
  if (checkMissing) {
    const present = new Set(files.map((f) => f.url));
    for (const r of rows) for (const url of [r.d, r.t, r.c]) if (isMediaUrl(url) && !present.has(url)) missing.push({ photoId: r.id, listingId: r.listingId, url });
  }
  return { media, rawUploads, missing, referenced: referenced.size };
}

/** Delete orphans by URL, re-checking each against the rows first; `confirm` is the number typed back. */
export async function deleteOrphans(db: Db, urls: string[], confirm: number): Promise<Result<{ deleted: number }>> {
  const report = await orphanReport(db);
  const still = new Set(report.media.map((m) => m.url));
  const targets = urls.filter((u) => still.has(u));
  if (targets.length !== confirm) return fail(`Type ${targets.length} to confirm.`);
  await deleteMedia(targets);
  return ok({ deleted: targets.length });
}

export async function sweepRawUploads(): Promise<number> {
  const dayAgo = Date.now() - 86_400_000;
  const stale = (await listRawUploads()).filter((r) => r.uploadedAt.getTime() < dayAgo);
  for (const r of stale) await deleteRawUpload(r.ref);
  return stale.length;
}

export async function bulkDeletePhotos(db: Db, photoIds: number[]): Promise<Result<{ deleted: number; kept: number }>> {
  const map = await photoFileUrls(db, photoIds);
  // Never a listing's last photo: keep one per listing if every photo was selected.
  const byListing = new Map<number, number[]>();
  for (const [id, { listingId }] of map) byListing.set(listingId, [...(byListing.get(listingId) ?? []), id]);
  let kept = 0;
  const toDelete: number[] = [];
  for (const [listingId, ids] of byListing) {
    const [{ total }] = await db.select({ total: count() }).from(listingPhotos).where(eq(listingPhotos.listingId, listingId));
    if (Number(total) <= ids.length) {
      kept++;
      const [first] = await db.select({ id: listingPhotos.id }).from(listingPhotos).where(eq(listingPhotos.listingId, listingId)).orderBy(asc(listingPhotos.sortOrder), asc(listingPhotos.id)).limit(1);
      toDelete.push(...ids.filter((i) => i !== first?.id));
    } else toDelete.push(...ids);
  }
  if (toDelete.length) {
    await db.delete(listingPhotos).where(inArray(listingPhotos.id, toDelete));
    await deleteMedia(toDelete.flatMap((id) => map.get(id)?.urls ?? []));
    // Renumber each touched listing.
    for (const listingId of byListing.keys()) {
      const rest = await db.select({ id: listingPhotos.id }).from(listingPhotos).where(eq(listingPhotos.listingId, listingId)).orderBy(asc(listingPhotos.sortOrder), asc(listingPhotos.id));
      for (const [i, p] of rest.entries()) await db.update(listingPhotos).set({ sortOrder: i }).where(eq(listingPhotos.id, p.id));
    }
  }
  return ok({ deleted: toDelete.length, kept });
}

/* ------------------------------------------------------------ broadcast */

export type Audience = { kind: "all" } | { kind: "accounts" } | { kind: "semester"; code: string } | { kind: "individual"; userIds: string[] };

/**
 * Who a broadcast goes to: posters of public listings, every account (with or
 * without a listing), every poster in a semester, or named people. Banned
 * people are left out of every audience.
 */
export async function broadcastRecipients(db: Db, audience: Audience): Promise<Recipient[]> {
  if (audience.kind === "individual" && audience.userIds.length === 0) return [];
  const columns = { email: user.email, displayName: listings.displayName, firstName: user.firstName, lastName: user.lastName, name: user.name, legacyNetid: user.legacyNetid, listingId: listings.id };
  const notBanned = sql`coalesce(${user.banned}, false) = false`;
  const rows =
    audience.kind === "semester"
      ? await db
          .select(columns)
          .from(listingSemesters)
          .innerJoin(listings, eq(listings.id, listingSemesters.listingId))
          .innerJoin(user, eq(user.id, listings.userId))
          .where(and(notBanned, eq(listingSemesters.semesterCode, audience.code)))
      : audience.kind === "all"
        ? await db.select(columns).from(listings).innerJoin(user, eq(user.id, listings.userId)).where(and(notBanned, publicListingWhere()))
        : await db
            .select(columns)
            .from(user)
            .leftJoin(listings, eq(listings.userId, user.id))
            .where(audience.kind === "individual" ? and(notBanned, inArray(user.id, audience.userIds)) : notBanned)
            .orderBy(asc(user.createdAt));
  const seen = new Set<string>();
  return rows
    .filter((r) => !seen.has(r.email) && seen.add(r.email))
    .map((r) => ({ email: r.email, name: posterFirstName({ ...r, legacyNames: [r.displayName, r.name] }), posted: r.listingId !== null }));
}

const broadcastInput = z.object({ subject: z.string().trim().min(1).max(150).refine((s) => !/[\r\n]/.test(s)), body: z.string().trim().min(1).max(10_000) });
const audienceInput: z.ZodType<Audience> = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("all") }),
  z.object({ kind: z.literal("accounts") }),
  z.object({ kind: z.literal("semester"), code: z.string().min(1) }),
  z.object({ kind: z.literal("individual"), userIds: z.array(z.string().uuid()) }),
]);

export async function sendBroadcastTo(db: Db, audience: Audience, raw: { subject: string; body: string }): Promise<Result<{ sent: number; failed: number }>> {
  const parsed = broadcastInput.safeParse(raw);
  if (!parsed.success) return fail("Subject and message are required.");
  const to = audienceInput.safeParse(audience);
  if (!to.success) return fail("Pick who to send to.");
  const recipients = await broadcastRecipients(db, to.data);
  if (recipients.length === 0) return fail("Nobody to send to.");
  return ok(await sendBroadcast(recipients, parsed.data.subject, parsed.data.body, { pauseMs: 600 }));
}

/* ------------------------------------------------------------ inventory */

export interface InventoryListing {
  id: number;
  ownerEmail: string;
  ownerName: string | null;
  address: string;
  status: string;
  hidden: boolean;
  semesterLabel: string;
  semesterCodes: string[];
  bytes: number;
  photos: { id: number; sortOrder: number; thumbUrl: string; displayUrl: string; bytes: number | null; width: number | null; height: number | null }[];
}

/** Every listing's photos, for the Images tab. */
export async function imageInventory(db: Db): Promise<InventoryListing[]> {
  const rows = await db
    .select({ id: listings.id, ownerEmail: user.email, poster: posterColumns, displayName: listings.displayName, address: listings.address, status: listings.status, hidden: sql<boolean>`not (${visibleSemesterWhere()})` })
    .from(listings)
    .innerJoin(user, eq(user.id, listings.userId))
    .orderBy(desc(listings.id));
  const ids = rows.map((r) => r.id);
  const photos = ids.length
    ? await db
        .select({ id: listingPhotos.id, listingId: listingPhotos.listingId, sortOrder: listingPhotos.sortOrder, thumbUrl: listingPhotos.thumbUrl, displayUrl: listingPhotos.displayUrl, bytes: listingPhotos.bytes, width: listingPhotos.width, height: listingPhotos.height })
        .from(listingPhotos)
        .where(inArray(listingPhotos.listingId, ids))
        .orderBy(asc(listingPhotos.listingId), asc(listingPhotos.sortOrder), asc(listingPhotos.id))
    : [];
  const { listingSemestersByListing, labelFor } = await import("@/server/data/semesters");
  const sems = await listingSemestersByListing(db, ids);
  return rows.map(({ poster, displayName, ...r }) => {
    const mine = photos.filter((p) => p.listingId === r.id);
    const { label, codes } = labelFor(sems.get(r.id) ?? [], false);
    return { ...r, ownerName: shownName({ displayName }, poster, r.ownerEmail), semesterLabel: label, semesterCodes: codes, bytes: mine.reduce((t, p) => t + (p.bytes ?? 0), 0), photos: mine };
  });
}

/* --------------------------------------------------------------- stats */

/** Vercel Blob allowances on the Hobby plan, per month. Exceeding one blocks the store for 30 days. */
export const BLOB_CAPS = { bytes: 1024 ** 3, writes: 2000, transferBytes: 10 * 1024 ** 3 } as const;

export async function adminStats(db: Db) {
  const [[posts], [people], [photos], [hidden], [taken], [thisMonth]] = await Promise.all([
    db.select({ n: count() }).from(listings),
    db.select({ n: count() }).from(user),
    db.select({ n: count(), bytes: sql<number>`coalesce(sum(${listingPhotos.bytes}), 0)::bigint` }).from(listingPhotos),
    db.select({ n: count() }).from(listings).where(sql`not (${visibleSemesterWhere()})`),
    db.select({ n: count() }).from(listings).where(eq(listings.status, "taken")),
    db.select({ n: count() }).from(listingPhotos).where(sql`${listingPhotos.createdAt} >= date_trunc('month', now())`),
  ]);
  return {
    posts: Number(posts.n),
    people: Number(people.n),
    photos: Number(photos.n),
    bytes: Number(photos.bytes),
    hidden: Number(hidden.n),
    taken: Number(taken.n),
    /** Against the Blob caps on the Hobby plan (docs/vercel-setup.md section 8). Writes: each photo costs one raw upload plus three stored files. */
    storage: { files: Number(photos.n) * 3, bytes: Number(photos.bytes), writesThisMonth: Number(thisMonth.n) * 4, caps: BLOB_CAPS },
  };
}

export { sortSemesters };
