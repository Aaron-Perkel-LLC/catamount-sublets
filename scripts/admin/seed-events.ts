/**
 * Made-up activity for a test database, so the admin's charts and tables
 * have something to show on a preview: listing views (signed in and out),
 * contacts, shares, share arrivals, popup counts and a dozen invented
 * accounts, spread over the last six weeks. Never production: it refuses a
 * database holding any migrated account (production has them; a seeded
 * rehearsal or a local database has none) and needs --yes.
 *
 *   DATABASE_URL=… npm run seed-events -- --yes
 */
import { count, isNotNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { easternDate } from "@/lib/dates";
import { CONTACT_EVENT_TYPES, SHARE_TARGETS } from "@/lib/options";

const DAYS = 42;

/** A small deterministic generator, so a re-run seeds the same shape. */
function rng(seed: number) {
  let x = seed;
  return () => ((x = (x * 1_103_515_245 + 12_345) % 2 ** 31) / 2 ** 31);
}

async function main() {
  if (!process.argv.includes("--yes")) throw new Error("seed-events writes made-up events: pass --yes");
  if (process.env.VERCEL_ENV === "production") throw new Error("seed-events refuses to run against production");
  const db = await getDb();
  const [{ migrated }] = await db.select({ migrated: count() }).from(s.user).where(isNotNull(s.user.legacyNetid));
  if (migrated > 0) throw new Error(`this database holds ${migrated} migrated account(s); seeding events is refused`);

  const listings = await db.select({ id: s.listings.id, code: s.listingSemesters.semesterCode }).from(s.listings).leftJoin(s.listingSemesters, sql`${s.listingSemesters.listingId} = ${s.listings.id} and ${s.listingSemesters.position} = 0`);
  if (listings.length === 0) throw new Error("no listings: run npm run db:seed first");
  const rand = rng(32);
  const now = Date.now();
  const at = (daysAgo: number) => new Date(now - daysAgo * 86_400_000 - Math.floor(rand() * 20) * 3_600_000);
  const key = (prefix: string, n: number) => `${prefix}${n.toString(16)}`.padEnd(16, "0").slice(0, 16);

  const events: (typeof s.listingEvents.$inferInsert)[] = [];
  const dedupe = new Set<string>();
  const add = (e: typeof s.listingEvents.$inferInsert, dedupeType: boolean) => {
    if (dedupeType) {
      const k = `${e.type}:${e.listingId}:${e.actorKey}:${easternDate(e.createdAt as Date)}`;
      if (dedupe.has(k)) return;
      dedupe.add(k);
      e.dedupeKey = `seed:${k}`;
    }
    events.push(e);
  };
  for (let d = DAYS; d >= 0; d--) {
    const busy = 1 + Math.round(4 * (1 - d / DAYS)); // traffic grows towards today
    for (const l of listings) {
      for (let i = 0; i < busy; i++) {
        if (rand() < 0.45) continue;
        const signedOut = rand() < 0.55;
        const actor = signedOut ? key(`e${d}`, Math.floor(rand() * 40)) : key("a", Math.floor(rand() * 25));
        const createdAt = at(d);
        add({ listingId: l.id, actorKey: actor, signedOut, semesterCode: l.code, type: "listing_open", source: rand() < 0.6 ? "browse" : rand() < 0.5 ? "map" : "deeplink", createdAt }, true);
        if (!signedOut && rand() < 0.22) add({ listingId: l.id, actorKey: actor, semesterCode: l.code, type: CONTACT_EVENT_TYPES[Math.floor(rand() * 6) + 2], source: "browse", createdAt: new Date(createdAt.getTime() + 60_000) }, false);
        if (rand() < 0.06) add({ listingId: l.id, actorKey: actor, signedOut: false, semesterCode: l.code, type: "share_target", target: SHARE_TARGETS[Math.floor(rand() * SHARE_TARGETS.length)], source: "browse", createdAt }, false);
        if (rand() < 0.05) add({ listingId: l.id, actorKey: key(`s${d}`, i), signedOut: rand() < 0.6, semesterCode: l.code, type: "share_arrival", source: "share-link", createdAt }, true);
      }
    }
  }
  await db.insert(s.listingEvents).values(events);

  const people = Array.from({ length: 12 }, (_, i) => ({
    email: `seed-seeker-${i + 1}@example.com`,
    name: `Seeker ${i + 1}`,
    firstName: "Seeker",
    lastName: String(i + 1),
    createdAt: at(Math.floor(rand() * DAYS)),
    lastLoginAt: at(Math.floor(rand() * 20)),
  }));
  await db.insert(s.user).values(people).onConflictDoNothing();

  const [notice] = await db.select({ id: s.siteNotices.id }).from(s.siteNotices).limit(1);
  let notices = 0;
  if (notice) {
    const rows = Array.from({ length: 30 }, (_, i) => ({ noticeId: notice.id, type: "view", actorKey: key("n", i), signedOut: i % 2 === 0, createdAt: at(Math.floor(rand() * 14)) }));
    const more = rows.slice(0, 18).map((r, i) => ({ ...r, type: i < 5 ? "cta" : "dismiss" }));
    await db.insert(s.noticeEvents).values([...rows, ...more]).onConflictDoNothing();
    notices = rows.length + more.length;
  }
  console.log(`seeded ${events.length} listing events over ${DAYS + 1} days on ${listings.length} listings, ${people.length} accounts, ${notices} popup events`);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
