import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const uploadsDir = await mkdtemp(path.join(tmpdir(), "cs-mig-uploads-"));
const imagesDir = await mkdtemp(path.join(tmpdir(), "cs-mig-images-"));
process.env.UPLOADS_DIR = uploadsDir;

const { createTestDb } = await import("@/db/test-db");
const s = await import("@/db/schema");
const { eq } = await import("drizzle-orm");
const { parseDump } = await import("./dump-parser");
const { coerceRows } = await import("./sources");
const { buildPlan, legacyShareToken, parseOptOuts } = await import("./transform");
const { applyPlan, migrateImages, planDiff, verifyMigration } = await import("./apply");
const { browseListings } = await import("@/server/data/listings");
const { resolveShare } = await import("@/server/data/share");
const { parseListingQuery } = await import("@/lib/listing-filters");

const STEMS = ["a".repeat(32), "b".repeat(32), "c".repeat(32), "d".repeat(32), "f".repeat(32)];
const SECRET = "old-secret";

const DUMP = (opts: { dropListing3?: boolean } = {}) =>
  [
    "-- phpMyAdmin SQL Dump",
    'SET time_zone = "+00:00";',
    "INSERT INTO `semesters` (`id`, `code`, `name`, `active`, `sort_order`, `created_at`, `archived_at`) VALUES",
    "(6, 'spring27', 'Spring 2027', 1, 6, '2026-03-22 02:53:35', NULL),",
    "(7, 'summer27', 'Summer 2027', 1, 7, '2026-05-03 02:20:15', NULL),",
    "(8, 'fall26', 'Fall 2026', 0, 5, '2026-01-01 00:00:00', NULL);",
    "INSERT INTO `semester_archives` (`id`, `semester_code`, `semester_name`, `archived_at`, `archived_by`, `listings`, `taken`, `price_median`, `price_min`, `price_max`, `views`, `contacts`, `shares`, `share_arrivals`, `photos`, `bytes`, `tarball`) VALUES",
    "(1, 'summer26', 'Summer 2026', '2026-10-03 02:47:47', 'admin1', 11, 0, 1000.00, 700.00, 1225.00, 0, 26, 0, 0, 20, 26412136, 'semester-summer26-20261003T024746Z.tar.gz');",
    "INSERT INTO `sublets` (`id`, `image_url`, `thumbnail_url`, `price`, `price_negotiable`, `address`, `semester`, `bedrooms`, `bathrooms`, `roommates`, `roommate_gender`, `roommate_preference`, `lat`, `lon`, `description`, `posted_at`, `username`, `display_name`, `contact_email`, `contact_phone`, `utility_electric`, `utility_gas`, `utility_water`, `utility_internet`, `utility_cost`, `amenity_free_parking`, `amenity_paid_parking`, `amenity_laundry_free`, `amenity_laundry_paid`, `amenity_dishwasher`, `amenity_air_conditioning`, `amenity_pets_allowed`, `amenity_furnished`, `status`, `status_changed_at`) VALUES",
    `(187, './public/images/${STEMS[1]}.jpg', './public/images/${STEMS[1]}_thumb.webp', 950.00, 1, '62, King Street, Burlington, Vermont, United States', 'spring27', 4, 1.5, 2, 'mixed', 'women', 44.476200, -73.210600, 'Sunny room.\\'Rex\\' lives here.`,
    "Second line.', '2026-03-21 23:07:23', 'jsmith', 'Sam', 'jsmith@uvm.edu', '802-555-0100', 'tenant', '', '', 'landlord', NULL, 0, 0, 1, 0, 0, 0, 1, 1, 'open', NULL),",
    `(2, './public/images/${STEMS[2]}.png', NULL, 700.00, 0, '35 N Winooski Ave, Burlington', 'spring27', NULL, NULL, 0, '', '', 44.481500, -73.208900, NULL, '2026-04-01 12:00:00', 'admin1', '', 'admin1@uvm.edu', NULL, '', '', '', '', 50.00, 1, 0, 0, 0, 0, 0, 0, 0, 'paused', '2026-09-01 10:00:00')${opts.dropListing3 ? ";" : ","}`,
    ...(opts.dropListing3 ? [] : [
      `(3, './public/images/${STEMS[3]}.jpg', NULL, 1200.00, 0, '1 Main St', 'spring27', 1, 1.0, 0, '', '', 44.479000, -73.207000, 'Studio', '2026-05-05 05:05:05', 'optout', '', 'optout@uvm.edu', NULL, '', '', '', '', NULL, 0, 0, 0, 0, 0, 0, 0, 0, 'open', NULL),`,
      `(4, './public/images/${STEMS[4]}.jpg', NULL, 800.00, 0, '2 Elm St', 'spring27', 2, 1.0, 1, 'women', '', 44.478000, -73.206000, 'Nice', '2026-06-06 06:06:06', 'gone', 'Gone', 'gone@uvm.edu', NULL, '', '', '', '', NULL, 0, 0, 0, 0, 0, 0, 0, 0, 'open', NULL);`,
    ]),
    "INSERT INTO `sublet_images` (`id`, `sublet_id`, `image_url`, `sort_order`) VALUES",
    `(10, 187, './public/images/${STEMS[0]}.jpg', 5),`,
    `(11, 187, './public/images/${STEMS[1]}.jpg', 2),`,
    `(12, 2, './public/images/${STEMS[2]}.png', 0)${opts.dropListing3 ? ";" : ","}`,
    ...(opts.dropListing3 ? [] : [`(13, 3, './public/images/${STEMS[3]}.jpg', 0),`, `(14, 4, './public/images/${STEMS[4]}.jpg', 0);`]),
    "INSERT INTO `sublet_semesters` (`sublet_id`, `semester_code`) VALUES",
    "(187, 'summer27'),",
    "(187, 'spring27'),",
    `(2, 'spring27')${opts.dropListing3 ? ";" : ","}`,
    ...(opts.dropListing3 ? [] : ["(3, 'spring27'),", "(4, 'spring27');"]),
    "ALTER TABLE `sublets`",
    "  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=220;",
    "ALTER TABLE `sublet_images`",
    "  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=645;",
  ].join("\n");

type Db = Awaited<ReturnType<typeof createTestDb>>["db"];
let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  for (const [i, stem] of STEMS.entries()) {
    const ext = i === 2 ? "png" : "jpg";
    const img = sharp({ create: { width: 640 + i * 10, height: 480, channels: 3, background: { r: 29, g: 79, b: 115 } } });
    await writeFile(path.join(imagesDir, `${stem}.${ext}`), await (ext === "png" ? img.png() : img.jpeg()).toBuffer());
  }
  await writeFile(path.join(imagesDir, `${"e".repeat(32)}.jpg`), await sharp({ create: { width: 100, height: 100, channels: 3, background: "#000" } }).jpeg().toBuffer()); // orphan on disk
});
afterAll(async () => {
  await close();
  await rm(uploadsDir, { recursive: true, force: true });
  await rm(imagesDir, { recursive: true, force: true });
});

const load = (opts?: Parameters<typeof DUMP>[0]) => {
  const p = parseDump(DUMP(opts));
  return coerceRows(p.tables, p.autoIncrement);
};
const files = async () => (await readdir(path.join(uploadsDir, "media"), { recursive: true }).catch(() => [] as string[])).filter((f) => f.includes(".")).length;

describe("the migration", () => {
  it("builds the plan: opt-outs removed, admin mapped, semesters ordered, photos renumbered, tokens derived", () => {
    const data = load();
    expect(data.sublets[0].description).toBe("Sunny room.'Rex' lives here.\nSecond line.");
    expect(data.sublets[0].posted_at?.toISOString()).toBe("2026-03-21T23:07:23.000Z");
    expect(data.autoIncrement).toEqual({ sublets: 220, sublet_images: 645 });
    const plan = buildPlan(data, { optOuts: parseOptOuts("# people who replied\noptout\n"), shareSecret: SECRET });
    expect(plan.excluded).toEqual({ netids: ["optout"], listingIds: [3] });
    expect(plan.users.map((u) => [u.legacyNetid, u.email, u.role, u.name, u.firstName, u.lastName])).toEqual([
      ["jsmith", "jsmith@uvm.edu", "user", "Sam", "Sam", null],
      ["admin1", "admin@catamountsublets.com", "admin", "admin1", null, null],
      ["gone", "gone@uvm.edu", "user", "Gone", null, null], // a "name shown" that is the username is no name
    ]);
    expect(plan.listingSemesters.filter((x) => x.listingId === 187)).toEqual([
      { listingId: 187, code: "spring27", position: 0 },
      { listingId: 187, code: "summer27", position: 1 },
    ]);
    expect(plan.photos.filter((p) => p.listingId === 187).map((p) => [p.id, p.sortOrder])).toEqual([
      [11, 0],
      [10, 1],
    ]);
    expect(plan.listings.find((l) => l.id === 187)?.legacyShareToken).toBe(legacyShareToken(187, SECRET));
    expect(plan.warnings).toEqual([]);
  });

  it("applies, uploads, verifies, and is idempotent", async () => {
    const data = load();
    const plan = buildPlan(data, { optOuts: new Set(["optout"]), shareSecret: SECRET });
    const diff = await planDiff(db, plan);
    expect(diff.listings).toEqual({ insert: 3, update: 0, wouldDelete: [] });

    const report = await applyPlan(db, plan, { prune: false });
    expect(report.users).toEqual({ inserted: 3, updated: 0 });
    expect(report.listings).toEqual({ inserted: 3, updated: 0 });
    const images = await migrateImages(db, plan, imagesDir);
    expect(images).toMatchObject({ processed: 4, skipped: 0, missing: [], failed: [] });
    expect(await files()).toBe(12);

    const v = await verifyMigration(db, data, plan, imagesDir, { fetchImages: false });
    expect(v.problems, JSON.stringify(v.problems)).toEqual(["legacy-images has 2 file(s) no row names (not migrated): dddddddddddddddddddddddddddddddd.jpg, eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee.jpg"]);
    expect(v.counts.listings).toEqual({ source: 3, target: 3 });

    // The sequences continue from the legacy counters.
    const seq = await db.execute((await import("drizzle-orm")).sql`select nextval('listings_id_seq') as n`);
    const seqRows = (Array.isArray(seq) ? seq : (seq as { rows: { n: string }[] }).rows) as { n: string }[];
    expect(Number(seqRows[0].n)).toBe(220);

    // Legacy share links resolve; the board shows the open listing with photos in legacy order.
    const r = await resolveShare(db, 187, legacyShareToken(187, SECRET));
    expect(r.state).toBe("open");
    const board = (await browseListings(db, parseListingQuery({}), null)).listings;
    expect(board.map((l) => l.id).sort()).toEqual([187, 4]);
    expect(board.find((l) => l.id === 187)?.photos.map((p) => p.display.includes(STEMS[1]))).toEqual([true, false]);
    expect(board.find((l) => l.id === 187)?.semesterLabel).toBe("Spring & Summer 2027");

    // Again: nothing changes.
    const again = await applyPlan(db, plan, { prune: false });
    expect(again.listings).toEqual({ inserted: 0, updated: 3 });
    const imagesAgain = await migrateImages(db, plan, imagesDir);
    expect(imagesAgain).toMatchObject({ processed: 0, skipped: 4 });
    expect(await files()).toBe(12);
  });

  it("prunes what the source no longer has, and refuses once the target has life", async () => {
    const data = load({ dropListing3: true }); // listings 3 and 4 gone on the old site
    const plan = buildPlan(data, { optOuts: new Set(), shareSecret: SECRET });
    const diff = await planDiff(db, plan);
    expect(diff.listings.wouldDelete).toEqual([4]);
    const report = await applyPlan(db, plan, { prune: true });
    expect(report.pruned).toEqual({ listings: 1, users: 1, files: 3 });
    expect(await files()).toBe(9);
    expect(await db.select().from(s.listings).where(eq(s.listings.id, 4))).toHaveLength(0);
    const v = await verifyMigration(db, data, plan, null, { fetchImages: false });
    expect(v.problems, JSON.stringify(v.problems)).toEqual([]);

    await db.insert(s.session).values({ userId: plan.users[0] && (await db.select({ id: s.user.id }).from(s.user).where(eq(s.user.legacyNetid, "jsmith")))[0].id, token: "t", expiresAt: new Date(Date.now() + 1e6), updatedAt: new Date() });
    await expect(applyPlan(db, plan, { prune: true })).rejects.toThrow(/sessions/);
  });
});
