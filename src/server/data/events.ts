import { and, count, eq, gt, sql, type SQL } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { listingEvents, listings, listingSemesters, semesters } from "@/db/schema";
import { easternDate, SITE_TIME_ZONE } from "@/lib/dates";
import {
  CONTACT_EVENT_TYPES,
  EVENT_SOURCES,
  EVENT_TYPES,
  EVENTS_PER_MINUTE,
  type EventSource,
  type EventType,
  SHARE_EVENT_TYPES,
  SHARE_TARGETS,
  type ShareTarget,
} from "@/lib/options";
import { createHmac } from "node:crypto";
import { actorKey, appSecret, parseShareSlug, verifyShareToken } from "@/lib/share";
import { publicListingWhere, signedOutAudienceWhere, visibleSemesterWhere } from "./visibility";

/**
 * The activity log. No user ids are stored: the actor is a keyed hash, and
 * every reader counts distinct keys, so no page says who did what. The
 * admin's own actions are excluded, and so are a poster's views and contacts
 * on their own listing; a poster's shares count, because sharing your own
 * listing is how listings travel. The deduplicated types count once per
 * person, listing and Eastern day.
 */

export type RecordResult = "stored" | "duplicate" | "excluded" | "limited" | "invalid";

export interface EventInput {
  listingId: number;
  type: string;
  source?: string | null;
  target?: string | null;
}

export async function recordEvent(db: DbOrTx, actor: { id: string; role: "user" | "admin" }, input: EventInput): Promise<RecordResult> {
  if (!Number.isInteger(input.listingId) || input.listingId <= 0 || !(input.type in EVENT_TYPES)) return "invalid";
  const type = input.type as EventType;
  const source = input.source && (EVENT_SOURCES as readonly string[]).includes(input.source) ? (input.source as EventSource) : null;
  let target: ShareTarget | null = null;
  if (type === "share_target") {
    if (!input.target || !(SHARE_TARGETS as readonly string[]).includes(input.target)) return "invalid";
    target = input.target as ShareTarget;
  }

  // Poster and semester come from the listing itself, never the request.
  const [listing] = await db
    .select({ userId: listings.userId, semesterCode: listingSemesters.semesterCode })
    .from(listings)
    .leftJoin(listingSemesters, and(eq(listingSemesters.listingId, listings.id), eq(listingSemesters.position, 0)))
    .where(eq(listings.id, input.listingId))
    .limit(1);
  if (!listing) return "invalid";

  if (actor.role === "admin") return "excluded";
  if (actor.id === listing.userId && !SHARE_EVENT_TYPES.includes(type)) return "excluded";

  const key = actorKey(actor.id);
  const [{ n }] = await db
    .select({ n: count() })
    .from(listingEvents)
    .where(and(eq(listingEvents.actorKey, key), gt(listingEvents.createdAt, new Date(Date.now() - 60_000))));
  if (n >= EVENTS_PER_MINUTE) return "limited";

  const dedupeKey = EVENT_TYPES[type].dedupe ? `${type}:${input.listingId}:${key}:${easternDate(new Date())}` : null;
  const inserted = await db
    .insert(listingEvents)
    .values({ listingId: input.listingId, actorKey: key, semesterCode: listing.semesterCode, type, source, target, dedupeKey })
    .onConflictDoNothing({ target: listingEvents.dedupeKey })
    .returning({ id: listingEvents.id });
  return inserted.length > 0 ? "stored" : "duplicate";
}

/**
 * A signed-out visitor's actor key: HMAC(APP_SECRET, "anon-view:" + Eastern
 * date + ":" + IP + "\n" + user agent), first 16 hex. It changes every
 * Eastern day, so one visitor is one view per listing per day and cannot be
 * followed from one day to the next, and the IP cannot be recovered from it.
 * The IP itself is never stored or logged.
 */
export function anonymousActorKey(ip: string, userAgent: string, at = new Date()): string {
  return createHmac("sha256", appSecret()).update(`anon-view:${easternDate(at)}:${ip}\n${userAgent}`).digest("hex").slice(0, 16);
}

/**
 * A signed-out view (listing_open, nothing else): only for a listing on the
 * signed-out board, with the same per-key rate limit and Eastern-day dedupe
 * as a signed-in view, flagged signed_out. The caller has dropped bots.
 */
export async function recordAnonymousView(db: DbOrTx, input: { listingId: number; source?: string | null; ip: string; userAgent: string }): Promise<RecordResult> {
  if (!Number.isInteger(input.listingId) || input.listingId <= 0 || !input.ip) return "invalid";
  const source = input.source && (EVENT_SOURCES as readonly string[]).includes(input.source) ? (input.source as EventSource) : null;
  const now = new Date();
  const key = anonymousActorKey(input.ip, input.userAgent, now);
  // The limit before the listing, so whether a request is limited never says anything about the listing.
  if (await anonymousLimited(db, key, now)) return "limited";
  const [listing] = await db
    .select({ semesterCode: listingSemesters.semesterCode })
    .from(listings)
    .leftJoin(listingSemesters, and(eq(listingSemesters.listingId, listings.id), eq(listingSemesters.position, 0)))
    .where(and(eq(listings.id, input.listingId), publicListingWhere(), signedOutAudienceWhere()))
    .limit(1);
  if (!listing) return "invalid";

  const type: EventType = "listing_open";
  const inserted = await db
    .insert(listingEvents)
    .values({
      listingId: input.listingId,
      actorKey: key,
      semesterCode: listing.semesterCode,
      type,
      source,
      signedOut: true,
      dedupeKey: `${type}:${input.listingId}:${key}:${easternDate(now)}`,
    })
    .onConflictDoNothing({ target: listingEvents.dedupeKey })
    .returning({ id: listingEvents.id });
  return inserted.length > 0 ? "stored" : "duplicate";
}

async function anonymousLimited(db: DbOrTx, key: string, now: Date): Promise<boolean> {
  const [{ n }] = await db
    .select({ n: count() })
    .from(listingEvents)
    .where(and(eq(listingEvents.actorKey, key), gt(listingEvents.createdAt, new Date(now.getTime() - 60_000))));
  return n >= EVENTS_PER_MINUTE;
}

/**
 * A signed-out visitor arriving by a share link: the same daily code, limit
 * and Eastern-day dedupe as a signed-out view. Only for an open listing on
 * the board that is either public, or reached through its own valid share
 * slug (a students-only listing's share link still counts). The caller has
 * dropped bots and answers the same whatever this returns.
 */
export async function recordAnonymousShareArrival(
  db: DbOrTx,
  input: { listingId: number; slug?: string | null; source?: string | null; ip: string; userAgent: string },
): Promise<RecordResult> {
  if (!Number.isInteger(input.listingId) || input.listingId <= 0 || !input.ip) return "invalid";
  const source = input.source && (EVENT_SOURCES as readonly string[]).includes(input.source) ? (input.source as EventSource) : null;
  const now = new Date();
  const key = anonymousActorKey(input.ip, input.userAgent, now);
  if (await anonymousLimited(db, key, now)) return "limited";
  const [listing] = await db
    .select({ semesterCode: listingSemesters.semesterCode, isPublic: sql<boolean>`${signedOutAudienceWhere()}`, legacyToken: listings.legacyShareToken })
    .from(listings)
    .leftJoin(listingSemesters, and(eq(listingSemesters.listingId, listings.id), eq(listingSemesters.position, 0)))
    .where(and(eq(listings.id, input.listingId), publicListingWhere()))
    .limit(1);
  if (!listing) return "invalid";
  const parsed = input.slug ? parseShareSlug(input.slug) : null;
  const bySlug = parsed !== null && parsed.id === input.listingId && verifyShareToken(parsed.id, parsed.token, listing.legacyToken);
  if (!listing.isPublic && !bySlug) return "invalid";

  const type: EventType = "share_arrival";
  const inserted = await db
    .insert(listingEvents)
    .values({ listingId: input.listingId, actorKey: key, semesterCode: listing.semesterCode, type, source, signedOut: true, dedupeKey: `${type}:${input.listingId}:${key}:${easternDate(now)}` })
    .onConflictDoNothing({ target: listingEvents.dedupeKey })
    .returning({ id: listingEvents.id });
  return inserted.length > 0 ? "stored" : "duplicate";
}

export type ActivityRange = "open" | "30d" | "all";
export const ACTIVITY_RANGES: ActivityRange[] = ["open", "30d", "all"];

/** The reporting window. "open" is events tagged with an active semester, or on a listing still in a visible semester. */
export function activityWindow(range: ActivityRange): SQL {
  switch (range) {
    case "30d":
      return sql`${listingEvents.createdAt} >= now() - interval '30 days'`;
    case "all":
      return sql`true`;
    default:
      return sql`(${listingEvents.semesterCode} in (select code from ${semesters} where active)
        or ${listingEvents.listingId} in (select ${listings.id} from ${listings} where ${visibleSemesterWhere()}))`;
  }
}

const contactIn = sql.join(
  CONTACT_EVENT_TYPES.map((t) => sql`${t}`),
  sql`, `,
);

export interface ListingActivity {
  views: number;
  contacts: number;
  /** People who both viewed and got in touch: what conversion divides by views. */
  converted: number;
  shares: number;
  arrivals: number;
}

/** Per-listing totals; everything about people is a count of distinct actor keys. */
export async function listingActivity(db: DbOrTx, range: ActivityRange): Promise<Map<number, ListingActivity>> {
  const where = activityWindow(range);
  const rows = await db
    .select({
      listingId: listingEvents.listingId,
      views: sql<number>`count(distinct case when ${listingEvents.type} = 'listing_open' then ${listingEvents.actorKey} end)::int`,
      contacts: sql<number>`count(distinct case when ${listingEvents.type} in (${contactIn}) then ${listingEvents.actorKey} end)::int`,
      shares: sql<number>`count(case when ${listingEvents.type} = 'share_target' then 1 end)::int`,
      arrivals: sql<number>`count(distinct case when ${listingEvents.type} = 'share_arrival' then ${listingEvents.actorKey} end)::int`,
    })
    .from(listingEvents)
    .where(where)
    .groupBy(listingEvents.listingId);
  const out = new Map<number, ListingActivity>();
  for (const r of rows) out.set(r.listingId, { views: r.views, contacts: r.contacts, converted: 0, shares: r.shares, arrivals: r.arrivals });

  const converted = await db.execute<{ listing_id: number; converted: number }>(sql`
    select listing_id, count(*)::int as converted from (
      select ${listingEvents.listingId} as listing_id, ${listingEvents.actorKey} as actor
      from ${listingEvents}
      where ${where}
      group by ${listingEvents.listingId}, ${listingEvents.actorKey}
      having count(case when ${listingEvents.type} = 'listing_open' then 1 end) > 0
         and count(case when ${listingEvents.type} in (${contactIn}) then 1 end) > 0
    ) t group by listing_id`);
  for (const r of rowsOf<{ listing_id: number; converted: number }>(converted)) {
    const entry = out.get(Number(r.listing_id));
    if (entry) entry.converted = Number(r.converted);
  }
  return out;
}

/** Share-target taps by target, most used first. */
export async function shareTargetCounts(db: DbOrTx, range: ActivityRange): Promise<{ target: string; n: number }[]> {
  const rows = await db
    .select({ target: listingEvents.target, n: sql<number>`count(*)::int` })
    .from(listingEvents)
    .where(and(eq(listingEvents.type, "share_target"), activityWindow(range)))
    .groupBy(listingEvents.target)
    .orderBy(sql`count(*) desc`);
  return rows.map((r) => ({ target: r.target ?? "unknown", n: r.n }));
}

/** Listing views by where they started. */
export async function viewSourceCounts(db: DbOrTx, range: ActivityRange): Promise<{ source: string; n: number }[]> {
  const rows = await db
    .select({ source: listingEvents.source, n: sql<number>`count(*)::int` })
    .from(listingEvents)
    .where(and(eq(listingEvents.type, "listing_open"), activityWindow(range)))
    .groupBy(listingEvents.source)
    .orderBy(sql`count(*) desc`);
  return rows.map((r) => ({ source: r.source ?? "unknown", n: r.n }));
}

/** People viewing and getting in touch per Eastern day, oldest first, empty days filled in. */
export async function dailyActivity(db: DbOrTx, days: number): Promise<{ day: string; views: number; contacts: number }[]> {
  // The zone is a literal, not a bind parameter: Postgres must see the same expression in SELECT and GROUP BY.
  const dayExpr = sql`(${listingEvents.createdAt} at time zone ${sql.raw(`'${SITE_TIME_ZONE}'`)})::date`;
  const rows = await db
    .select({
      day: sql<string>`to_char(${dayExpr}, 'YYYY-MM-DD')`,
      views: sql<number>`count(distinct case when ${listingEvents.type} = 'listing_open' then ${listingEvents.listingId} || ':' || ${listingEvents.actorKey} end)::int`,
      contacts: sql<number>`count(distinct case when ${listingEvents.type} in (${contactIn}) then ${listingEvents.listingId} || ':' || ${listingEvents.actorKey} end)::int`,
    })
    .from(listingEvents)
    .where(sql`${listingEvents.createdAt} >= now() - make_interval(days => ${days})`)
    .groupBy(dayExpr);
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const out: { day: string; views: number; contacts: number }[] = [];
  const today = easternDate(new Date());
  const [y, m, d] = today.split("-").map(Number);
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(Date.UTC(y, m - 1, d - i)).toISOString().slice(0, 10);
    const r = byDay.get(day);
    out.push({ day, views: r?.views ?? 0, contacts: r?.contacts ?? 0 });
  }
  return out;
}

/** The poster's line: people who viewed, got in touch, and share taps, since the listing went up. */
export async function posterStats(db: DbOrTx, listingId: number, since: Date): Promise<{ views: number; contacts: number; shares: number }> {
  const [row] = await db
    .select({
      views: sql<number>`count(distinct case when ${listingEvents.type} = 'listing_open' then ${listingEvents.actorKey} end)::int`,
      contacts: sql<number>`count(distinct case when ${listingEvents.type} in (${contactIn}) then ${listingEvents.actorKey} end)::int`,
      shares: sql<number>`count(case when ${listingEvents.type} = 'share_target' then 1 end)::int`,
    })
    .from(listingEvents)
    .where(and(eq(listingEvents.listingId, listingId), gt(listingEvents.createdAt, since)));
  return row ?? { views: 0, contacts: 0, shares: 0 };
}

/** db.execute() returns rows differently per driver; this reads either shape. */
function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const r = result as { rows?: T[] };
  return r.rows ?? [];
}
