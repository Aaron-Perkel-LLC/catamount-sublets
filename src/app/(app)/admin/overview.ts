import "server-only";
import type { Kpi } from "@/components/admin/KpiCard";
import type { Stat, StatGroup } from "@/components/admin/StatList";
import { num } from "@/components/admin/ui";
import type { DbOrTx } from "@/db";
import type { AttentionFlag } from "@/lib/admin-attention";
import { countChip, rateChip, share } from "@/lib/admin-delta";
import { rangeQuery, type ResolvedRange, weekStart } from "@/lib/admin-range";
import { type BarBucket, TREND_WINDOW, type TrendPoint, trendMode, trendRange, trendSeries } from "@/lib/admin-trend";
import { easternDate } from "@/lib/dates";
import { VIEWER_SEGMENTS, type ViewerSegment } from "@/lib/viewer-segment";
import { adminPosts, listingRows } from "@/server/data/admin-listings";
import { activitySeries, listingNumbers, overviewMetrics, sourcesAndTargets } from "@/server/data/admin-metrics";

/** EVENT_SOURCES and SHARE_TARGETS (src/lib/options.ts) as people say them. */
const SOURCE_LABELS: Record<string, string> = { browse: "Browse", map: "Map", "share-link": "Share link", deeplink: "Direct link", post: "Post page", unknown: "Not recorded" };
const TARGET_LABELS: Record<string, string> = { native: "Share sheet", instagram: "Instagram", snapchat: "Snapchat", text: "Text", email: "Email", x: "X", copy: "Copy link", unknown: "Not recorded" };
const SEGMENT_KEYS = VIEWER_SEGMENTS.map((s) => s.key) as ViewerSegment[];
const sumOf = (xs: number[]) => xs.reduce((t, x) => t + x, 0);

export interface OverviewView {
  bucket: BarBucket;
  points: TrendPoint[];
  kpis: Kpi[];
  groups: StatGroup[];
  funnel: { label: string; n: number; tip: string }[];
  sources: { label: string; n: number }[];
  targets: { label: string; n: number }[];
  attention: { id: number; label: string; views: number; contacts: number; ageDays: number | null; flags: AttentionFlag[] }[];
  query: string;
}

/** A day's contact rate needs this many signed-in views, or one person's tap is a 50% day. */
const RATE_MIN_VIEWS = 5;
const pct = (contacts: number, views: number) => (views >= RATE_MIN_VIEWS ? Math.min(100, Math.round((contacts / views) * 100)) : null);

/**
 * The Overview's numbers, shaped for the page. The queries are phase 32's;
 * what is added is each headline number over the range, three ways
 * (src/lib/admin-trend.ts): a bar per day with that day's own count, the
 * 7-day average over the bars, and the card's sparkline (trailing 7-day
 * totals, with contacts counted once per person and listing across each
 * window by the query). New listings per day are counted here from the
 * listings' own dates; the contact rate is contacts over signed-in views,
 * per bar and, for the line, over the 7 days together. Views are split by
 * whatever VIEWER_SEGMENTS lists; the contact rate and the funnel are about
 * signed-in and signed-out by name.
 */
export async function overviewView(db: DbOrTx, r: ResolvedRange): Promise<OverviewView> {
  const asked = trendRange(r);
  const [o, series, st, posts, numbers] = await Promise.all([overviewMetrics(db, r), activitySeries(db, asked, trendMode(r) === "rolling" ? TREND_WINDOW : 1), sourcesAndTargets(db, r), adminPosts(db), listingNumbers(db, r)]);

  const postedOn = new Map<string, number>();
  for (const p of posts) {
    if (p.legacyImport) continue;
    const day = easternDate(p.postedAt);
    // Only the days the series covers: a week's bar must not pick up the days of that week outside the range.
    if (day < asked.chartFrom || day > r.to) continue;
    const key = asked.bucket === "week" ? weekStart(day) : day;
    postedOn.set(key, (postedOn.get(key) ?? 0) + 1);
  }
  const t = trendSeries(
    r,
    series.map((d) => ({ day: d.day, ...d.views, views: sumOf(SEGMENT_KEYS.map((k) => d.views[k])), contacts: d.contacts, listings: postedOn.get(d.day) ?? 0 })),
    [...SEGMENT_KEYS, "views", "contacts", "listings"],
    { contacts: series.map((d) => d.contactsWindow) },
  );

  const out = o.views.signed_out;
  const signedIn = o.views.signed_in;
  const views = sumOf(SEGMENT_KEYS.map((k) => o.views[k].cur));
  const viewsPrev = r.prev ? sumOf(SEGMENT_KEYS.map((k) => o.views[k].prev ?? 0)) : null;
  const rate = share(o.contacts.cur, o.signedInViewers.cur);
  const ratePrev = o.contacts.prev === null || o.signedInViewers.prev === null ? null : share(o.contacts.prev, o.signedInViewers.prev);

  const kpis: Kpi[] = [
    {
      key: "views",
      label: "Views",
      value: num(views),
      chip: countChip(views, viewsPrev),
      tip: "A view is one person opening one listing on one Eastern day.",
      series: t.spark.views,
      bars: t.bars.views,
      avg: t.avg?.views ?? null,
      noun: ["view", "views"],
      split: VIEWER_SEGMENTS.map((s) => ({ label: s.label.toLowerCase(), n: o.views[s.key].cur })),
      extra: VIEWER_SEGMENTS.map((s) => ({ label: s.label.toLowerCase(), values: t.bars[s.key] })),
    },
    {
      key: "contacts",
      label: "Got in touch",
      value: num(o.contacts.cur),
      chip: countChip(o.contacts.cur, o.contacts.prev),
      tip: `People who got in touch about a listing, counted once per listing. ${num(o.taps.cur)} taps in all (copy, call, text, mail app).`,
      series: t.spark.contacts,
      bars: t.bars.contacts,
      avg: t.avg?.contacts ?? null,
      noun: ["got in touch", "got in touch"],
      seriesNote: "Someone who got in touch about one listing in two bars is in both, so the bars can add up to more than the card.",
    },
    {
      key: "rate",
      label: "View → contact",
      value: rate === null ? "—" : `${Math.round(rate)}%`,
      chip: rateChip(rate, ratePrev, o.signedInViewers.prev),
      tip: `${num(o.contacts.cur)} of ${num(o.signedInViewers.cur)} signed-in viewers got in touch. Signed-out visitors can't, so they aren't in it. The chart divides by signed-in views.`,
      series: t.spark.contacts.map((c, i) => (t.spark.signed_in[i] > 0 ? Math.min(100, Math.round((c / t.spark.signed_in[i]) * 100)) : null)),
      bars: t.bars.contacts.map((c, i) => pct(c, t.bars.signed_in[i])),
      avg: t.totals ? t.totals.contacts.map((c, i) => pct(c, t.totals!.signed_in[i])) : null,
      noun: ["got in touch", "got in touch"],
      gap: `under ${RATE_MIN_VIEWS} signed-in views`,
      extra: [
        { label: "got in touch", values: t.bars.contacts },
        { label: "signed-in views", values: t.bars.signed_in },
      ],
      seriesNote: `A bar is drawn only with ${RATE_MIN_VIEWS} or more signed-in views (a stub on the axis is a real 0%); the line is the 7 days' contacts over their signed-in views. Both divide by signed-in views (people-days), the card by signed-in viewers, so they can differ.`,
      unit: "percent",
    },
    {
      key: "listings",
      label: "New listings",
      value: num(o.newListings.cur),
      chip: countChip(o.newListings.cur, o.newListings.prev),
      tip: "Posted in the range. Listings carried over from the old site aren't counted.",
      series: t.spark.listings,
      bars: t.bars.listings,
      avg: t.avg?.listings ?? null,
      noun: ["new listing", "new listings"],
    },
  ];

  const stat = (label: string, n: number, more: Partial<Stat> = {}): Stat => ({ label, value: num(n), zero: n === 0, ...more });
  const arrivals = sumOf(SEGMENT_KEYS.map((k) => o.shareArrivals[k].cur));
  const arrivalsPrev = r.prev ? sumOf(SEGMENT_KEYS.map((k) => o.shareArrivals[k].prev ?? 0)) : null;
  const filled = share(o.outcomes.throughSite.cur, o.outcomes.answered.cur);

  return {
    bucket: t.bucket,
    points: t.points,
    kpis,
    groups: [
      {
        title: "Board",
        stats: [
          stat("On the board", o.board.open, { tip: "Open, visible, with a photo, right now." }),
          stat("Public", o.board.public, { tip: "Also on the signed-out board (needs its approximate area)." }),
          stat("Students only", o.board.studentsOnly, { tip: "Kept to signed-in students by the admin." }),
        ],
      },
      {
        title: "Audience",
        stats: [
          stat("New accounts", o.newAccounts.cur, { chip: countChip(o.newAccounts.cur, o.newAccounts.prev), tip: "Not counting migrated accounts or the admin." }),
          stat("Share arrivals", arrivals, { chip: countChip(arrivals, arrivalsPrev), tip: `${VIEWER_SEGMENTS.map((s) => `${num(o.shareArrivals[s.key].cur)} ${s.label.toLowerCase()}`).join(", ")}. Someone who arrives signed out and then signs in counts once in each.` }),
          stat("Saved searches", o.savedSearches.added.cur, { chip: countChip(o.savedSearches.added.cur, o.savedSearches.added.prev), tip: `Added in the range. ${num(o.savedSearches.total)} saved in all.` }),
          stat("Digest subscribers", o.digest.subscribed, { tip: `Subscribed now. In the range ${num(o.digest.joined.cur)} joined and ${num(o.digest.left.cur)} left (left is each subscription's current state).` }),
        ],
      },
      {
        title: "Outcomes",
        stats: [
          stat("Answered", o.outcomes.answered.cur, { chip: countChip(o.outcomes.answered.cur, o.outcomes.answered.prev), tip: "Posters who said how their listing ended." }),
          stat("Filled through us", o.outcomes.throughSite.cur, { tip: filled === null ? "No answers in the range yet." : `${Math.round(filled)}% of the answers.` }),
        ],
      },
    ],
    funnel: [
      { label: "Views, signed out", n: out.cur, tip: "People-days" },
      { label: "New accounts", n: o.newAccounts.cur, tip: "Not migrated, not the admin" },
      { label: "Views, signed in", n: signedIn.cur, tip: "People-days" },
      { label: "Got in touch", n: o.contacts.cur, tip: "A person per listing" },
      { label: "Filled through us", n: o.outcomes.throughSite.cur, tip: "Posters' answers" },
    ],
    sources: st.sources.map((x) => ({ label: SOURCE_LABELS[x.key] ?? x.key, n: x.n })),
    targets: st.targets.map((x) => ({ label: TARGET_LABELS[x.key] ?? x.key, n: x.n })),
    attention: listingRows(posts, numbers)
      .filter((x) => x.flags.length > 0)
      .map((a) => ({ id: a.id, label: a.label, views: a.views, contacts: a.contacts, ageDays: a.ageDays, flags: a.flags as AttentionFlag[] })),
    query: rangeQuery(r),
  };
}
