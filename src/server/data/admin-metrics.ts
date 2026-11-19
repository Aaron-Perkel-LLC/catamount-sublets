import "server-only";
import { sql, type SQL } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import {
  adminMessages,
  digestSends,
  digestSubscriptions,
  listingEvents,
  listingOutcomes,
  listings,
  noticeEvents,
  savedSearches,
  session,
  siteNotices,
  user,
} from "@/db/schema";
import { bucketKeys, type Period, type ResolvedRange } from "@/lib/admin-range";
import { easternDayStart, SITE_TIME_ZONE } from "@/lib/dates";
import { FINAL_OUTCOMES } from "@/lib/listing-outcome";
import { CONTACT_EVENT_TYPES } from "@/lib/options";
import { type BySegment, emptySegments, type ViewerSegment } from "@/lib/viewer-segment";
import { publicListingWhere } from "./visibility";
import { segmentSql } from "./viewer-segment";

/**
 * The admin's numbers for a date range (src/lib/admin-range.ts). Admin pages
 * only: every caller has passed the admin check, and nothing here returns an
 * email or a person's id. Counts follow the activity log's own rules: a view
 * is a person-listing-day (deduplicated per Eastern day, src/server/data/events.ts),
 * a contact is a person who got in touch about a listing (however many taps),
 * and a signed-out person is a new code every day.
 *
 * Every number comes with the previous equal period (null when the range has
 * none), counted in the same query with FILTER so a page is a few round trips.
 */

export interface Pair {
  cur: number;
  prev: number | null;
}

const TZ = sql.raw(`'${SITE_TIME_ZONE}'`);
const ts = (d: Date) => sql`${d.toISOString()}::timestamptz`;
const within = (col: unknown, p: Period | null): SQL => (p ? sql`(${col} >= ${ts(p.start)} and ${col} < ${ts(p.end)})` : sql`false`);
/** Rows from the earliest instant either period needs, so one scan serves both. */
const since = (r: ResolvedRange) => ts(r.prev ? r.prev.start : r.start);
const contactIn = sql.join(
  CONTACT_EVENT_TYPES.map((t) => sql`${t}`),
  sql`, `,
);
const finalIn = sql.join(
  FINAL_OUTCOMES.map((t) => sql`${t}`),
  sql`, `,
);
const pair = (r: ResolvedRange, cur: unknown, prev: unknown): Pair => ({ cur: Number(cur ?? 0), prev: r.prev ? Number(prev ?? 0) : null });

/** The Eastern day or week (its Monday) a timestamp falls in, as a date. */
export function easternBucketSql(col: unknown, bucket: "day" | "week"): SQL<string> {
  return bucket === "day" ? sql<string>`((${col} at time zone ${TZ})::date)::text` : sql<string>`(date_trunc('week', ${col} at time zone ${TZ})::date)::text`;
}

/** db.execute() returns rows differently per driver; this reads either shape. */
function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return (result as { rows?: T[] }).rows ?? [];
}
async function all<T>(db: DbOrTx, q: SQL): Promise<T[]> {
  return rowsOf<T>(await db.execute(q));
}
async function one<T>(db: DbOrTx, q: SQL): Promise<T> {
  return (await all<T>(db, q))[0];
}

/* -------------------------------------------------------------- overview */

export interface Overview {
  board: { open: number; public: number; studentsOnly: number };
  newListings: Pair;
  newAccounts: Pair;
  views: Record<ViewerSegment, Pair>;
  /** People who got in touch about a listing (a person counts once per listing per range). */
  contacts: Pair;
  /** Contact taps, raw (copy, open mail app, dial, text…). */
  taps: Pair;
  /** Signed-in people who viewed a listing, per listing: what the contact rate divides by (signed-out visitors can't get in touch). */
  signedInViewers: Pair;
  shareArrivals: Record<ViewerSegment, Pair>;
  savedSearches: { total: number; added: Pair };
  digest: { subscribed: number; joined: Pair; left: Pair };
  outcomes: { answered: Pair; throughSite: Pair };
}

export async function overviewMetrics(db: DbOrTx, r: ResolvedRange): Promise<Overview> {
  const cur = (col: unknown) => within(col, r);
  const prev = (col: unknown) => within(col, r.prev);
  const at = listingEvents.createdAt;

  const [board, posted, accounts, events, segments, searches, digest, outcomes] = await Promise.all([
    one<{ open: number; public: number; students: number }>(
      db,
      sql`select count(*)::int as open, count(*) filter (where not ${listings.signedInOnly})::int as public, count(*) filter (where ${listings.signedInOnly})::int as students
          from ${listings} where ${publicListingWhere()}`,
    ),
    one<{ c: number; p: number }>(db, sql`select count(*) filter (where ${cur(listings.postedAt)})::int as c, count(*) filter (where ${prev(listings.postedAt)})::int as p from ${listings} where not ${listings.legacyImport}`),
    one<{ c: number; p: number }>(
      db,
      sql`select count(*) filter (where ${cur(user.createdAt)})::int as c, count(*) filter (where ${prev(user.createdAt)})::int as p
          from ${user} where ${user.legacyNetid} is null and ${user.role} is distinct from 'admin'`,
    ),
    one<{ cc: number; cp: number; tc: number; tp: number; vc: number; vp: number }>(
      db,
      sql`select
            count(distinct ${listingEvents.listingId} || ':' || ${listingEvents.actorKey}) filter (where ${listingEvents.type} in (${contactIn}) and ${cur(at)})::int as cc,
            count(distinct ${listingEvents.listingId} || ':' || ${listingEvents.actorKey}) filter (where ${listingEvents.type} in (${contactIn}) and ${prev(at)})::int as cp,
            count(*) filter (where ${listingEvents.type} in (${contactIn}) and ${cur(at)})::int as tc,
            count(*) filter (where ${listingEvents.type} in (${contactIn}) and ${prev(at)})::int as tp,
            count(distinct ${listingEvents.listingId} || ':' || ${listingEvents.actorKey}) filter (where ${listingEvents.type} = 'listing_open' and not ${listingEvents.signedOut} and ${cur(at)})::int as vc,
            count(distinct ${listingEvents.listingId} || ':' || ${listingEvents.actorKey}) filter (where ${listingEvents.type} = 'listing_open' and not ${listingEvents.signedOut} and ${prev(at)})::int as vp
          from ${listingEvents} where ${at} >= ${since(r)} and ${at} < ${ts(r.end)}`,
    ),
    all<{ seg: ViewerSegment; type: string; c: number; p: number }>(
      db,
      sql`select ${segmentSql()} as seg, ${listingEvents.type} as type, count(*) filter (where ${cur(at)})::int as c, count(*) filter (where ${prev(at)})::int as p
          from ${listingEvents}
          where ${listingEvents.type} in ('listing_open', 'share_arrival') and ${at} >= ${since(r)} and ${at} < ${ts(r.end)}
          group by 1, 2`,
    ),
    one<{ total: number; c: number; p: number }>(
      db,
      sql`select count(*)::int as total, count(*) filter (where ${cur(savedSearches.createdAt)})::int as c, count(*) filter (where ${prev(savedSearches.createdAt)})::int as p from ${savedSearches}`,
    ),
    one<{ on: number; jc: number; jp: number; lc: number; lp: number }>(
      db,
      sql`select count(*) filter (where ${digestSubscriptions.enabled})::int as on,
            count(*) filter (where ${digestSubscriptions.enabled} and ${cur(digestSubscriptions.enabledAt)})::int as jc,
            count(*) filter (where ${digestSubscriptions.enabled} and ${prev(digestSubscriptions.enabledAt)})::int as jp,
            count(*) filter (where not ${digestSubscriptions.enabled} and ${cur(digestSubscriptions.updatedAt)})::int as lc,
            count(*) filter (where not ${digestSubscriptions.enabled} and ${prev(digestSubscriptions.updatedAt)})::int as lp
          from ${digestSubscriptions}`,
    ),
    one<{ ac: number; ap: number; sc: number; sp: number }>(
      db,
      sql`select count(*) filter (where ${listingOutcomes.outcome} in (${finalIn}) and ${cur(listingOutcomes.updatedAt)})::int as ac,
            count(*) filter (where ${listingOutcomes.outcome} in (${finalIn}) and ${prev(listingOutcomes.updatedAt)})::int as ap,
            count(*) filter (where ${listingOutcomes.outcome} = 'through_site' and ${cur(listingOutcomes.updatedAt)})::int as sc,
            count(*) filter (where ${listingOutcomes.outcome} = 'through_site' and ${prev(listingOutcomes.updatedAt)})::int as sp
          from ${listingOutcomes}`,
    ),
  ]);

  const bySeg = (type: string): Record<ViewerSegment, Pair> => {
    const out = Object.fromEntries(Object.keys(emptySegments()).map((k) => [k, pair(r, 0, 0)])) as Record<ViewerSegment, Pair>;
    for (const row of segments) if (row.type === type && row.seg in out) out[row.seg] = pair(r, row.c, row.p);
    return out;
  };

  return {
    board: { open: Number(board.open), public: Number(board.public), studentsOnly: Number(board.students) },
    newListings: pair(r, posted.c, posted.p),
    newAccounts: pair(r, accounts.c, accounts.p),
    views: bySeg("listing_open"),
    contacts: pair(r, events.cc, events.cp),
    taps: pair(r, events.tc, events.tp),
    signedInViewers: pair(r, events.vc, events.vp),
    shareArrivals: bySeg("share_arrival"),
    savedSearches: { total: Number(searches.total), added: pair(r, searches.c, searches.p) },
    digest: { subscribed: Number(digest.on), joined: pair(r, digest.jc, digest.jp), left: pair(r, digest.lc, digest.lp) },
    outcomes: { answered: pair(r, outcomes.ac, outcomes.ap), throughSite: pair(r, outcomes.sc, outcomes.sp) },
  };
}

/* ---------------------------------------------------------------- series */

export interface SeriesPoint {
  /** The Eastern day, or the Monday of the week. */
  day: string;
  views: BySegment;
  contacts: number;
}

/** Views by segment and contacts per bucket, from the chart's first day (never before cutover), empty buckets filled. */
export async function activitySeries(db: DbOrTx, r: ResolvedRange): Promise<SeriesPoint[]> {
  const b = easternBucketSql(listingEvents.createdAt, r.bucket);
  const rows = await all<{ b: string; seg: ViewerSegment; views: number; contacts: number }>(
    db,
    sql`select ${b} as b, ${segmentSql()} as seg,
          count(*) filter (where ${listingEvents.type} = 'listing_open')::int as views,
          count(distinct ${listingEvents.listingId} || ':' || ${listingEvents.actorKey}) filter (where ${listingEvents.type} in (${contactIn}))::int as contacts
        from ${listingEvents}
        where ${listingEvents.createdAt} >= ${ts(easternDayStart(r.chartFrom))} and ${listingEvents.createdAt} < ${ts(r.end)}
        group by 1, 2`,
  );
  const map = new Map(bucketKeys(r.chartFrom, r.to, r.bucket).map((day) => [day, { day, views: emptySegments(), contacts: 0 } as SeriesPoint]));
  for (const row of rows) {
    const p = map.get(row.b);
    if (!p) continue;
    if (row.seg in p.views) p.views[row.seg] += Number(row.views);
    p.contacts += Number(row.contacts);
  }
  return [...map.values()];
}

/** Where views start (source) and where shares go (target), in the range. */
export async function sourcesAndTargets(db: DbOrTx, r: ResolvedRange): Promise<{ sources: { key: string; n: number }[]; targets: { key: string; n: number }[] }> {
  const rows = await all<{ kind: string; key: string | null; n: number }>(
    db,
    sql`select 'source' as kind, ${listingEvents.source} as key, count(*)::int as n from ${listingEvents}
          where ${listingEvents.type} = 'listing_open' and ${within(listingEvents.createdAt, r)} group by 2
        union all
        select 'target', ${listingEvents.target}, count(*)::int from ${listingEvents}
          where ${listingEvents.type} = 'share_target' and ${within(listingEvents.createdAt, r)} group by 2`,
  );
  const pick = (kind: string) =>
    rows
      .filter((x) => x.kind === kind)
      .map((x) => ({ key: x.key ?? "unknown", n: Number(x.n) }))
      .sort((a, b) => b.n - a.n);
  return { sources: pick("source"), targets: pick("target") };
}

/* -------------------------------------------------------------- listings */

export interface ListingNumbers {
  views: number;
  /** People who got in touch in the range. */
  contacts: number;
  /** People who viewed and got in touch in the range. */
  converted: number;
  shares: number;
  arrivals: number;
  /** Views in the last 14 days, whatever the range. */
  views14: number;
  /** The last view ever, ISO, or null. */
  lastView: string | null;
}

/** Per listing id, including deleted listings that still have events (their events outlive them). */
export async function listingNumbers(db: DbOrTx, r: ResolvedRange): Promise<Map<number, ListingNumbers>> {
  const rows = await all<{ id: number; views: number; contacts: number; shares: number; arrivals: number; views14: number; last_view: string | null; converted: number }>(
    db,
    sql`with e as (
          select ${listingEvents.listingId} as id, ${listingEvents.actorKey} as actor, ${listingEvents.type} as type, ${listingEvents.createdAt} as at,
                 ${within(listingEvents.createdAt, r)} as cur
          from ${listingEvents}
        ), people as (
          select id, actor, bool_or(type = 'listing_open') as viewed, bool_or(type in (${contactIn})) as contacted
          from e where cur group by id, actor
        )
        select e.id,
          count(*) filter (where cur and type = 'listing_open')::int as views,
          count(distinct actor) filter (where cur and type in (${contactIn}))::int as contacts,
          count(*) filter (where cur and type = 'share_target')::int as shares,
          count(distinct actor) filter (where cur and type = 'share_arrival')::int as arrivals,
          count(*) filter (where type = 'listing_open' and at >= now() - interval '14 days')::int as views14,
          max(at) filter (where type = 'listing_open')::text as last_view,
          coalesce((select count(*) from people p where p.id = e.id and p.viewed and p.contacted), 0)::int as converted
        from e group by e.id`,
  );
  return new Map(
    rows.map((x) => [
      Number(x.id),
      {
        views: Number(x.views),
        contacts: Number(x.contacts),
        converted: Number(x.converted),
        shares: Number(x.shares),
        arrivals: Number(x.arrivals),
        views14: Number(x.views14),
        lastView: x.last_view ? new Date(x.last_view).toISOString() : null,
      },
    ]),
  );
}

export interface SemesterDemand {
  code: string;
  views: number;
  contacts: number;
  /** Distinct listings with at least one contact in the range. */
  listingsContacted: number;
}

/** Views and contacts in the range by the listing's first semester at the time (listing_events.semester_code). */
export async function demandBySemester(db: DbOrTx, r: ResolvedRange): Promise<SemesterDemand[]> {
  const rows = await all<{ code: string | null; views: number; contacts: number; contacted: number }>(
    db,
    sql`select ${listingEvents.semesterCode} as code,
          count(*) filter (where ${listingEvents.type} = 'listing_open')::int as views,
          count(distinct ${listingEvents.listingId} || ':' || ${listingEvents.actorKey}) filter (where ${listingEvents.type} in (${contactIn}))::int as contacts,
          count(distinct ${listingEvents.listingId}) filter (where ${listingEvents.type} in (${contactIn}))::int as contacted
        from ${listingEvents} where ${within(listingEvents.createdAt, r)} group by 1`,
  );
  return rows.filter((x) => x.code).map((x) => ({ code: x.code!, views: Number(x.views), contacts: Number(x.contacts), listingsContacted: Number(x.contacted) }));
}

/* -------------------------------------------------------------- accounts */

export interface AccountMetrics {
  weekly: { day: string; posters: number; seekers: number }[];
  /** Everyone but the admin, and how many were seen (signed in or used a session) in the last 7 and 30 days. */
  active: { total: number; d7: number; d30: number };
  visibility: { listings: number; studentsOnly: number; chose: number; choseStudentsOnly: number };
}

export async function accountMetrics(db: DbOrTx, r: ResolvedRange): Promise<AccountMetrics> {
  const b = easternBucketSql(user.createdAt, r.bucket);
  const [rows, active, vis] = await Promise.all([
    all<{ b: string; posters: number; seekers: number }>(
      db,
      sql`select ${b} as b,
            count(*) filter (where exists (select 1 from ${listings} l where l.user_id = ${user.id}))::int as posters,
            count(*) filter (where not exists (select 1 from ${listings} l where l.user_id = ${user.id}))::int as seekers
          from ${user}
          where ${user.legacyNetid} is null and ${user.role} is distinct from 'admin' and ${user.createdAt} >= ${ts(easternDayStart(r.chartFrom))} and ${user.createdAt} < ${ts(r.end)}
          group by 1`,
    ),
    // A session's updated_at moves at most daily while it is used (better-auth updateAge), so this is "seen" to within a day.
    one<{ total: number; d7: number; d30: number }>(
      db,
      sql`with seen as (
            select greatest(${user.lastLoginAt}, (select max(s.updated_at) from ${session} s where s.user_id = ${user.id})) as at
            from ${user} where ${user.role} is distinct from 'admin'
          )
          select count(*)::int as total,
            count(*) filter (where at >= now() - interval '7 days')::int as d7,
            count(*) filter (where at >= now() - interval '30 days')::int as d30
          from seen`,
    ),
    one<{ n: number; so: number; chose: number; chose_so: number }>(
      db,
      sql`select count(*)::int as n, count(*) filter (where ${listings.signedInOnly})::int as so,
            count(*) filter (where ${listings.visibilityChosenAt} is not null)::int as chose,
            count(*) filter (where ${listings.visibilityChosenAt} is not null and ${listings.signedInOnly})::int as chose_so
          from ${listings}`,
    ),
  ]);
  const map = new Map(bucketKeys(r.chartFrom, r.to, r.bucket).map((day) => [day, { day, posters: 0, seekers: 0 }]));
  for (const row of rows) {
    const p = map.get(row.b);
    if (p) {
      p.posters += Number(row.posters);
      p.seekers += Number(row.seekers);
    }
  }
  return {
    weekly: [...map.values()],
    active: { total: Number(active.total), d7: Number(active.d7), d30: Number(active.d30) },
    visibility: { listings: Number(vis.n), studentsOnly: Number(vis.so), chose: Number(vis.chose), choseStudentsOnly: Number(vis.chose_so) },
  };
}

/* ----------------------------------------------------------------- comms */

export interface NoticeNumbers {
  id: number;
  title: string;
  active: boolean;
  views: number;
  dismissals: number;
  ctas: number;
}

/** Each popup's first views, dismissals and CTA clicks in the range (each person counts once per notice). */
export async function noticeNumbers(db: DbOrTx, r: ResolvedRange): Promise<NoticeNumbers[]> {
  const rows = await all<{ id: number; title: string; active: boolean; v: number; d: number; c: number }>(
    db,
    sql`select n.id, n.title, n.active,
          count(e.id) filter (where e.type = 'view')::int as v,
          count(e.id) filter (where e.type = 'dismiss')::int as d,
          count(e.id) filter (where e.type = 'cta')::int as c
        from ${siteNotices} n
        left join ${noticeEvents} e on e.notice_id = n.id and e.created_at >= ${ts(r.start)} and e.created_at < ${ts(r.end)}
        group by n.id, n.title, n.active
        order by n.id desc`,
  );
  return rows.map((x) => ({ id: Number(x.id), title: x.title, active: Boolean(x.active), views: Number(x.v), dismissals: Number(x.d), ctas: Number(x.c) }));
}

export interface DigestWeek {
  week: string;
  sent: number;
  empty: number;
  failed: number;
  pending: number;
  /** Turned off that week (by the email's link or from the account page); the subscription's current state, so a re-subscribe hides it. */
  leftByLink: number;
  leftFromAccount: number;
}

export async function digestWeeks(db: DbOrTx, r: ResolvedRange): Promise<DigestWeek[]> {
  const [sends, left] = await Promise.all([
    all<{ week: string; status: string; n: number }>(
      db,
      sql`select ${digestSends.week}::text as week, ${digestSends.status} as status, count(*)::int as n from ${digestSends}
          where ${digestSends.week} >= ${r.from}::date and ${digestSends.week} <= ${r.to}::date group by 1, 2`,
    ),
    all<{ week: string; via: string | null; n: number }>(
      db,
      sql`select ${easternBucketSql(digestSubscriptions.updatedAt, "week")} as week, ${digestSubscriptions.disabledVia} as via, count(*)::int as n
          from ${digestSubscriptions} where not ${digestSubscriptions.enabled} and ${within(digestSubscriptions.updatedAt, r)} group by 1, 2`,
    ),
  ]);
  const weeks = new Map<string, DigestWeek>();
  const get = (week: string) => weeks.get(week) ?? weeks.set(week, { week, sent: 0, empty: 0, failed: 0, pending: 0, leftByLink: 0, leftFromAccount: 0 }).get(week)!;
  for (const s of sends) {
    const w = get(s.week);
    if (s.status === "sent" || s.status === "empty" || s.status === "failed" || s.status === "pending") w[s.status] += Number(s.n);
  }
  for (const l of left) {
    const w = get(l.week);
    if (l.via === "link") w.leftByLink += Number(l.n);
    else w.leftFromAccount += Number(l.n);
  }
  return [...weeks.values()].sort((a, b) => b.week.localeCompare(a.week));
}

export interface MailBucket {
  day: string;
  sent: number;
  failed: number;
  pending: number;
}

/** The admin's one-off emails (Mail and request replies) per bucket in the range. */
export async function mailNumbers(db: DbOrTx, r: ResolvedRange): Promise<MailBucket[]> {
  const rows = await all<{ b: string; status: string; n: number }>(
    db,
    sql`select ${easternBucketSql(adminMessages.createdAt, r.bucket)} as b, ${adminMessages.status} as status, count(*)::int as n
        from ${adminMessages} where ${within(adminMessages.createdAt, r)} group by 1, 2`,
  );
  const map = new Map<string, MailBucket>();
  for (const row of rows) {
    const m = map.get(row.b) ?? { day: row.b, sent: 0, failed: 0, pending: 0 };
    if (row.status === "sent" || row.status === "failed" || row.status === "pending") m[row.status] += Number(row.n);
    map.set(row.b, m);
  }
  return [...map.values()].sort((a, b) => b.day.localeCompare(a.day));
}

/* ---------------------------------------------------------------- system */

export interface TableCounts {
  databaseBytes: number;
  rows: { table: string; n: number }[];
}

/** Row counts of the tables that grow, and the database's size (Neon's free plan stops at 0.5 GB). */
export async function tableCounts(db: DbOrTx): Promise<TableCounts> {
  const row = await one<Record<string, number | string>>(
    db,
    sql`select pg_database_size(current_database())::bigint as bytes,
          (select count(*) from ${listings})::int as listings,
          (select count(*) from ${user})::int as accounts,
          (select count(*) from ${session})::int as sessions,
          (select count(*) from ${listingEvents})::int as listing_events,
          (select count(*) from ${noticeEvents})::int as notice_events,
          (select count(*) from ${savedSearches})::int as saved_searches,
          (select count(*) from ${digestSends})::int as digest_sends,
          (select count(*) from ${adminMessages})::int as admin_messages`,
  );
  const { bytes, ...rest } = row;
  return { databaseBytes: Number(bytes), rows: Object.entries(rest).map(([table, n]) => ({ table, n: Number(n) })) };
}
