import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { and, eq, inArray, isNotNull, notInArray, sql } from "drizzle-orm";
import type { Db } from "../../src/db";
import { listingPhotos, listings, listingSemesters, semesterArchives, semesters, session, user } from "../../src/db/schema";
import { parseShareSlug, shareSlug, verifyShareToken } from "../../src/lib/share";
import { mediaPaths, processPhoto } from "../../src/server/images/process";
import { deleteMedia, putMediaIfAbsent } from "../../src/server/storage";
import { isTestAddress } from "../../src/server/email/send";
import type { Plan, PlanListing } from "./transform";
import type { LegacyData } from "./types";

/** Every run is a full re-upsert on the legacy keys; child sets are diffed per listing. */

export interface ApplyReport {
  users: { inserted: number; updated: number };
  listings: { inserted: number; updated: number };
  semesters: number;
  listingSemesters: number;
  archives: number;
  pruned: { listings: number; users: number; files: number };
}

const listingColumns = (l: PlanListing, userId: string) => ({
  id: l.id,
  userId,
  price: l.price,
  priceNegotiable: l.priceNegotiable,
  address: l.address,
  lat: l.lat,
  lon: l.lon,
  bedrooms: l.bedrooms,
  bathrooms: l.bathrooms,
  roommates: l.roommates,
  roommateGender: l.roommateGender,
  roommatePreference: l.roommatePreference,
  description: l.description,
  displayName: l.displayName,
  contactEmail: l.contactEmail,
  contactPhone: l.contactPhone,
  utilityElectric: l.utilityElectric,
  utilityGas: l.utilityGas,
  utilityWater: l.utilityWater,
  utilityInternet: l.utilityInternet,
  utilityCost: l.utilityCost,
  amenityFreeParking: l.amenityFreeParking,
  amenityPaidParking: l.amenityPaidParking,
  amenityLaundryFree: l.amenityLaundryFree,
  amenityLaundryPaid: l.amenityLaundryPaid,
  amenityDishwasher: l.amenityDishwasher,
  amenityAirConditioning: l.amenityAirConditioning,
  amenityPetsAllowed: l.amenityPetsAllowed,
  amenityFurnished: l.amenityFurnished,
  status: l.status,
  statusChangedAt: l.statusChangedAt,
  legacyShareToken: l.legacyShareToken,
  legacyImport: true,
  postedAt: l.postedAt,
  updatedAt: l.postedAt,
});

/** What --apply would do, for the dry run. */
export async function planDiff(db: Db, plan: Plan) {
  const existingUsers = await db.select({ netid: user.legacyNetid }).from(user).where(isNotNull(user.legacyNetid));
  const existingListings = await db.select({ id: listings.id }).from(listings).where(eq(listings.legacyImport, true));
  const userSet = new Set(existingUsers.map((u) => u.netid));
  const listingSet = new Set(existingListings.map((l) => l.id));
  const planIds = new Set(plan.listings.map((l) => l.id));
  const planNetids = new Set(plan.users.map((u) => u.legacyNetid));
  return {
    users: { insert: plan.users.filter((u) => !userSet.has(u.legacyNetid)).length, update: plan.users.filter((u) => userSet.has(u.legacyNetid)).length, wouldDelete: [...userSet].filter((n) => n && !planNetids.has(n)).length },
    listings: { insert: plan.listings.filter((l) => !listingSet.has(l.id)).length, update: plan.listings.filter((l) => listingSet.has(l.id)).length, wouldDelete: [...listingSet].filter((id) => !planIds.has(id)) },
    photos: plan.photos.length,
    semesters: plan.semesters.length,
    archives: plan.archives.length,
    excluded: plan.excluded,
    warnings: plan.warnings,
  };
}

/** Refuse to prune a database that people have started using. */
export async function targetHasLife(db: Db): Promise<string | null> {
  const [s] = await db.select({ id: session.id }).from(session).limit(1);
  if (s) return "the target has sessions: people have signed in";
  const [l] = await db.select({ id: listings.id }).from(listings).where(eq(listings.legacyImport, false)).limit(1);
  if (l) return `the target has a listing that was not imported (#${l.id})`;
  return null;
}

export async function applyPlan(db: Db, plan: Plan, options: { prune: boolean }): Promise<ApplyReport> {
  if (options.prune) {
    const life = await targetHasLife(db);
    if (life) throw new Error(`refusing --prune: ${life}`);
  }
  const report: ApplyReport = { users: { inserted: 0, updated: 0 }, listings: { inserted: 0, updated: 0 }, semesters: 0, listingSemesters: 0, archives: 0, pruned: { listings: 0, users: 0, files: 0 } };
  const prunedFiles: string[] = [];

  await db.transaction(async (tx) => {
    for (const s of plan.semesters) {
      await tx
        .insert(semesters)
        .values({ code: s.code, name: s.name, active: s.active, sortOrder: s.sortOrder, archivedAt: s.archivedAt, createdAt: s.createdAt ?? undefined })
        .onConflictDoUpdate({ target: semesters.code, set: { name: s.name, active: s.active, sortOrder: s.sortOrder, archivedAt: s.archivedAt } });
      report.semesters++;
    }

    const userIds = new Map<string, string>();
    for (const u of plan.users) {
      const [existing] = await tx.select({ id: user.id }).from(user).where(eq(user.legacyNetid, u.legacyNetid));
      if (existing) {
        // Names the person has typed on the new site win over a guess from the old one.
        await tx.update(user).set({ email: u.email, name: u.name, role: u.role, firstName: sql`coalesce(${user.firstName}, ${u.firstName})`, lastName: sql`coalesce(${user.lastName}, ${u.lastName})` }).where(eq(user.id, existing.id));
        userIds.set(u.legacyNetid, existing.id);
        report.users.updated++;
      } else {
        // The address may already exist (the admin seeded by hand): attach the NetID to it.
        const [byEmail] = await tx.select({ id: user.id }).from(user).where(eq(user.email, u.email));
        if (byEmail) {
          await tx.update(user).set({ legacyNetid: u.legacyNetid, role: u.role }).where(eq(user.id, byEmail.id));
          userIds.set(u.legacyNetid, byEmail.id);
          report.users.updated++;
        } else {
          const [row] = await tx.insert(user).values({ email: u.email, name: u.name, role: u.role, legacyNetid: u.legacyNetid, emailVerified: false, firstName: u.firstName, lastName: u.lastName }).returning({ id: user.id });
          userIds.set(u.legacyNetid, row.id);
          report.users.inserted++;
        }
      }
    }

    for (const l of plan.listings) {
      const cols = listingColumns(l, userIds.get(l.legacyNetid)!);
      const [existing] = await tx.select({ id: listings.id }).from(listings).where(eq(listings.id, l.id));
      await tx
        .insert(listings)
        .values(cols)
        .onConflictDoUpdate({ target: listings.id, set: cols });
      if (existing) report.listings.updated++;
      else report.listings.inserted++;
    }

    const planIds = plan.listings.map((l) => l.id);
    if (planIds.length) await tx.delete(listingSemesters).where(inArray(listingSemesters.listingId, planIds));
    if (plan.listingSemesters.length) {
      await tx.insert(listingSemesters).values(plan.listingSemesters.map((x) => ({ listingId: x.listingId, semesterCode: x.code, position: x.position })));
      report.listingSemesters = plan.listingSemesters.length;
    }

    for (const a of plan.archives) {
      await tx
        .insert(semesterArchives)
        .values({
          semesterCode: a.semester_code,
          semesterName: a.semester_name,
          archivedAt: a.archived_at,
          listings: a.listings,
          taken: a.taken,
          priceMedian: a.price_median,
          priceMin: a.price_min,
          priceMax: a.price_max,
          views: a.views,
          contacts: a.contacts,
          shares: a.shares,
          shareArrivals: a.share_arrivals,
          photos: a.photos,
          bytes: a.bytes,
          manifest: a.tarball ? { legacyTarball: a.tarball } : {},
        })
        .onConflictDoUpdate({ target: semesterArchives.semesterCode, set: { listings: a.listings, taken: a.taken, views: a.views, contacts: a.contacts, shares: a.shares, shareArrivals: a.share_arrivals, photos: a.photos, bytes: a.bytes } });
      report.archives++;
    }

    if (options.prune) {
      const gone = await tx.select({ id: listings.id }).from(listings).where(and(eq(listings.legacyImport, true), planIds.length ? notInArray(listings.id, planIds) : sql`true`));
      for (const g of gone) {
        const files = await tx.select({ d: listingPhotos.displayUrl, t: listingPhotos.thumbUrl, c: listingPhotos.cardUrl }).from(listingPhotos).where(eq(listingPhotos.listingId, g.id));
        prunedFiles.push(...files.flatMap((f) => [f.d, f.t, f.c]));
        await tx.delete(listings).where(eq(listings.id, g.id));
        report.pruned.listings++;
      }
      const planNetids = plan.users.map((u) => u.legacyNetid);
      const goneUsers = await tx
        .select({ id: user.id })
        .from(user)
        .where(and(isNotNull(user.legacyNetid), planNetids.length ? notInArray(user.legacyNetid, planNetids) : sql`true`));
      for (const u of goneUsers) {
        await tx.delete(user).where(eq(user.id, u.id));
        report.pruned.users++;
      }
    }

    // Sequences continue from the legacy AUTO_INCREMENT values, so no id is ever reused.
    await tx.execute(sql`select setval('listings_id_seq', ${Math.max(plan.autoIncrement.sublets - 1, 1)}, true)`);
    await tx.execute(sql`select setval('listing_photos_id_seq', ${Math.max(plan.autoIncrement.sublet_images - 1, 1)}, true)`);
  });

  if (prunedFiles.length) {
    await deleteMedia(prunedFiles);
    report.pruned.files = prunedFiles.length;
  }
  return report;
}

export interface ImageReport {
  processed: number;
  skipped: number;
  /** Files written to the store, and files found already there with the same size (no write). */
  uploaded: number;
  reused: number;
  missing: { photoId: number; listingId: number; path: string }[];
  failed: { photoId: number; error: string }[];
  bytes: number;
}

/** Find the legacy file for a stem whatever the extension's case. */
async function findLegacyFile(dir: string, stem: string, ext: string): Promise<string | null> {
  for (const candidate of [`${stem}.${ext}`, `${stem}.${ext.toUpperCase()}`]) {
    try {
      await readFile(path.join(dir, candidate), { flag: "r" });
      return path.join(dir, candidate);
    } catch {
      /* next */
    }
  }
  try {
    const names = await readdir(dir);
    const hit = names.find((n) => n.toLowerCase().startsWith(`${stem}.`) && !n.includes("_"));
    return hit ? path.join(dir, hit) : null;
  } catch {
    return null;
  }
}

/**
 * Originals from the rsynced directory go through the same sharp pipeline
 * as a new upload; the stem stays the legacy one so pathnames are
 * deterministic. A row whose hash already matches is only refreshed; a
 * file already in the store at the same size is reused, not written again
 * (writes are metered on the Hobby plan). Nothing full-size is stored.
 */
export async function migrateImages(db: Db, plan: Plan, imagesDir: string, options: { parallel?: number } = {}): Promise<ImageReport> {
  const report: ImageReport = { processed: 0, skipped: 0, uploaded: 0, reused: 0, missing: [], failed: [], bytes: 0 };
  const queue = [...plan.photos];
  const workers = Array.from({ length: options.parallel ?? 4 }, async () => {
    for (;;) {
      const photo = queue.shift();
      if (!photo) return;
      try {
        const file = await findLegacyFile(imagesDir, photo.stem, photo.ext);
        if (!file) {
          report.missing.push({ photoId: photo.id, listingId: photo.listingId, path: photo.legacyPath });
          continue;
        }
        const input = await readFile(file);
        const processed = await processPhoto(input);
        if ("error" in processed) {
          report.failed.push({ photoId: photo.id, error: processed.error });
          continue;
        }
        processed.stem = photo.stem;
        const [existing] = await db.select({ sha256: listingPhotos.sha256, display: listingPhotos.displayUrl }).from(listingPhotos).where(eq(listingPhotos.id, photo.id));
        if (existing && existing.sha256 === processed.sha256 && existing.display) {
          await db
            .update(listingPhotos)
            .set({ sortOrder: photo.sortOrder, listingId: photo.listingId, width: processed.width, height: processed.height, bytes: processed.bytes, contentType: processed.source.contentType })
            .where(eq(listingPhotos.id, photo.id));
          report.skipped++;
          continue;
        }
        const paths = mediaPaths(photo.listingId, processed);
        const [display, thumb, card] = await Promise.all([
          putMediaIfAbsent(paths.display, processed.display.data, processed.display.contentType),
          putMediaIfAbsent(paths.thumb, processed.thumb.data, processed.thumb.contentType),
          putMediaIfAbsent(paths.card, processed.card.data, processed.card.contentType),
        ]);
        for (const f of [display, thumb, card]) if (f.reused) report.reused++; else report.uploaded++;
        const row = {
          id: photo.id,
          listingId: photo.listingId,
          sortOrder: photo.sortOrder,
          stem: photo.stem,
          displayUrl: display.url,
          thumbUrl: thumb.url,
          cardUrl: card.url,
          width: processed.width,
          height: processed.height,
          bytes: processed.bytes,
          contentType: processed.source.contentType,
          sha256: processed.sha256,
        };
        await db.insert(listingPhotos).values(row).onConflictDoUpdate({ target: listingPhotos.id, set: row });
        report.processed++;
        report.bytes += processed.bytes;
      } catch (error) {
        report.failed.push({ photoId: photo.id, error: error instanceof Error ? error.message : String(error) });
      }
    }
  });
  await Promise.all(workers);
  // Photo rows for listings in the plan that the plan no longer lists (a photo deleted on the old site).
  const planPhotoIds = plan.photos.map((p) => p.id);
  const planListingIds = plan.listings.map((l) => l.id);
  if (planListingIds.length) {
    const stale = await db
      .select({ id: listingPhotos.id, d: listingPhotos.displayUrl, t: listingPhotos.thumbUrl, c: listingPhotos.cardUrl })
      .from(listingPhotos)
      .where(and(inArray(listingPhotos.listingId, planListingIds), planPhotoIds.length ? notInArray(listingPhotos.id, planPhotoIds) : sql`true`));
    if (stale.length) {
      await db.delete(listingPhotos).where(inArray(listingPhotos.id, stale.map((s) => s.id)));
      await deleteMedia(stale.flatMap((s) => [s.d, s.t, s.c]));
    }
  }
  return report;
}

export interface VerifyReport {
  problems: string[];
  counts: Record<string, { source: number; target: number }>;
}

/** Every row, both ways, plus the images by hash. Exit non-zero on any problem. */
export async function verifyMigration(db: Db, data: LegacyData, plan: Plan, imagesDir: string | null, options: { fetchImages: boolean }): Promise<VerifyReport> {
  const problems: string[] = [];
  const counts: VerifyReport["counts"] = {};

  const tUsers = await db.select().from(user).where(isNotNull(user.legacyNetid));
  const tListings = await db.select().from(listings).where(eq(listings.legacyImport, true));
  const tSems = await db.select().from(listingSemesters);
  const tPhotos = await db.select().from(listingPhotos);
  const tArchives = await db.select().from(semesterArchives);
  counts.users = { source: plan.users.length, target: tUsers.length };
  counts.listings = { source: plan.listings.length, target: tListings.length };
  counts.listing_semesters = { source: plan.listingSemesters.length, target: tSems.length };
  counts.photos = { source: plan.photos.length, target: tPhotos.length };
  counts.archives = { source: plan.archives.length, target: tArchives.length };
  for (const [k, v] of Object.entries(counts)) if (v.source !== v.target) problems.push(`${k}: ${v.source} in source, ${v.target} in target`);

  const userById = new Map(tUsers.map((u) => [u.id, u]));
  const canon = (l: PlanListing) =>
    JSON.stringify({ ...l, price: l.price.toFixed(2), bathrooms: l.bathrooms?.toFixed(1) ?? null, utilityCost: l.utilityCost?.toFixed(2) ?? null, postedAt: l.postedAt.getTime(), statusChangedAt: l.statusChangedAt?.getTime() ?? null, lat: l.lat.toFixed(6), lon: l.lon.toFixed(6) });
  const tById = new Map(tListings.map((l) => [l.id, l]));
  for (const l of plan.listings) {
    const t = tById.get(l.id);
    if (!t) {
      problems.push(`listing ${l.id} missing in target`);
      continue;
    }
    const owner = userById.get(t.userId);
    const asPlan: PlanListing = {
      id: t.id,
      legacyNetid: owner?.legacyNetid ?? "?",
      price: t.price,
      priceNegotiable: t.priceNegotiable,
      address: t.address,
      lat: t.lat,
      lon: t.lon,
      bedrooms: t.bedrooms,
      bathrooms: t.bathrooms,
      roommates: t.roommates,
      roommateGender: t.roommateGender,
      roommatePreference: t.roommatePreference,
      description: t.description,
      displayName: t.displayName,
      contactEmail: t.contactEmail,
      contactPhone: t.contactPhone,
      utilityElectric: t.utilityElectric,
      utilityGas: t.utilityGas,
      utilityWater: t.utilityWater,
      utilityInternet: t.utilityInternet,
      utilityCost: t.utilityCost,
      amenityFreeParking: t.amenityFreeParking,
      amenityPaidParking: t.amenityPaidParking,
      amenityLaundryFree: t.amenityLaundryFree,
      amenityLaundryPaid: t.amenityLaundryPaid,
      amenityDishwasher: t.amenityDishwasher,
      amenityAirConditioning: t.amenityAirConditioning,
      amenityPetsAllowed: t.amenityPetsAllowed,
      amenityFurnished: t.amenityFurnished,
      status: t.status,
      statusChangedAt: t.statusChangedAt,
      postedAt: t.postedAt,
      legacyShareToken: t.legacyShareToken,
    };
    if (canon(l) !== canon(asPlan)) problems.push(`listing ${l.id} differs: ${diffKeys(l, asPlan).join(", ")}`);
    const sems = tSems.filter((s) => s.listingId === l.id).sort((a, b) => a.position - b.position);
    const want = plan.listingSemesters.filter((s) => s.listingId === l.id).sort((a, b) => a.position - b.position);
    if (JSON.stringify(sems.map((s) => [s.semesterCode, s.position])) !== JSON.stringify(want.map((s) => [s.code, s.position]))) problems.push(`listing ${l.id} semesters differ`);
    const source = data.sublets.find((s) => s.id === l.id)!;
    if (source.semester !== want[0]?.code) problems.push(`listing ${l.id}: first semester ${want[0]?.code} is not the legacy primary ${source.semester}`);
    const photos = tPhotos.filter((p) => p.listingId === l.id).sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
    const wantPhotos = plan.photos.filter((p) => p.listingId === l.id).sort((a, b) => a.sortOrder - b.sortOrder);
    if (photos.length !== wantPhotos.length) problems.push(`listing ${l.id}: ${photos.length} photos in target, ${wantPhotos.length} planned`);
    const coverStem = /([a-f0-9]{32})\./i.exec(source.image_url)?.[1]?.toLowerCase();
    if (coverStem && photos[0] && photos[0].stem !== coverStem) problems.push(`listing ${l.id}: cover is ${photos[0].stem}, legacy cover was ${coverStem}`);
    if (l.legacyShareToken) {
      const parsed = parseShareSlug(`${l.id}-${l.legacyShareToken}`);
      if (!parsed || !verifyShareToken(l.id, parsed.token, t.legacyShareToken)) problems.push(`listing ${l.id}: legacy share slug does not round-trip`);
      if (!parseShareSlug(shareSlug(l.id))) problems.push(`listing ${l.id}: new share slug malformed`);
    }
  }
  for (const u of plan.users) {
    const t = tUsers.find((x) => x.legacyNetid === u.legacyNetid);
    if (!t) problems.push(`user ${u.legacyNetid} missing`);
    else if (!process.env.VITEST && isTestAddress(t.email)) problems.push(`user ${u.legacyNetid}: test address ${t.email} in target`); // the fixture dump uses invented people
    else if (t.email !== u.email || t.role !== u.role) problems.push(`user ${u.legacyNetid}: email/role differ`);
  }
  for (const a of plan.archives) {
    const t = tArchives.find((x) => x.semesterCode === a.semester_code);
    if (!t) problems.push(`archive ${a.semester_code} missing`);
    else if (t.listings !== a.listings || t.contacts !== a.contacts || t.views !== a.views) problems.push(`archive ${a.semester_code}: totals differ`);
  }

  if (imagesDir) {
    const files = new Set((await readdir(imagesDir).catch(() => [])).map((f) => f.toLowerCase()));
    const referenced = new Set(plan.photos.map((p) => `${p.stem}.${p.ext}`));
    const orphans = [...files].filter((f) => !f.includes("_") && !referenced.has(f) && /\.(jpe?g|png|gif|webp|bmp)$/.test(f));
    if (orphans.length) problems.push(`legacy-images has ${orphans.length} file(s) no row names (not migrated): ${orphans.slice(0, 5).join(", ")}${orphans.length > 5 ? "…" : ""}`);
  }
  if (options.fetchImages) {
    // Every stored file answers, and the three sizes add up to what the row says was stored.
    for (const p of tPhotos) {
      let stored = 0;
      let remote = 0;
      for (const url of [p.displayUrl, p.thumbUrl, p.cardUrl]) {
        if (!url) {
          problems.push(`photo ${p.id}: empty url`);
          continue;
        }
        if (!/^https?:/.test(url)) continue; // local mode: files are on disk
        remote++;
        try {
          const res = await fetch(url, { method: "HEAD" });
          if (!res.ok) problems.push(`photo ${p.id}: ${url} → ${res.status}`);
          else stored += Number(res.headers.get("content-length") ?? 0);
        } catch (e) {
          problems.push(`photo ${p.id}: ${url} unreachable (${(e as Error).message})`);
        }
      }
      if (remote === 3 && p.bytes != null && stored !== p.bytes) problems.push(`photo ${p.id}: stored ${stored} bytes, row says ${p.bytes}`);
    }
  }
  return { problems, counts };
}

function diffKeys(a: PlanListing, b: PlanListing): string[] {
  return (Object.keys(a) as (keyof PlanListing)[]).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
}
