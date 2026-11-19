import "server-only";
import { countChip, type Kpi, type OverviewVm, rateChip, type Stat } from "@/components/admin-lab/model";
import { getDb } from "@/db";
import { ATTENTION, type AttentionFlag } from "@/lib/admin-attention";
import { type AdminSearchParams, param } from "@/lib/admin-page";
import { addDays, CUTOVER_DATE, rangeQuery, resolveRange } from "@/lib/admin-range";
import { dayLabel } from "@/lib/chart";
import { easternDate } from "@/lib/dates";
import { listPendingAccessRequests } from "@/server/data/access-requests";
import { adminPosts, listingRows } from "@/server/data/admin-listings";
import { activitySeries, listingNumbers, overviewMetrics, sourcesAndTargets } from "@/server/data/admin-metrics";

const SOURCE_LABELS: Record<string, string> = { browse: "Browse", map: "Map", "share-link": "Share link", deeplink: "Direct link", post: "Post page", unknown: "Not recorded" };
const TARGET_LABELS: Record<string, string> = { native: "Share sheet", instagram: "Instagram", snapchat: "Snapchat", text: "Text", email: "Email", x: "X", copy: "Copy link", unknown: "Not recorded" };
const FLAG_SHORT: Record<AttentionFlag, string> = { "no-views": "No views", unconfirmed: "Unconfirmed", "no-contacts": "No contacts" };

/** Up to this many days the chart is daily; past it each point is the 7 days ending that day. */
const DAILY_MAX = 14;
const WINDOW = 7;

const fmt = (n: number) => n.toLocaleString("en-US");
const span = (a: string, b: string) => (a === b ? dayLabel(a) : `${dayLabel(a)} – ${dayLabel(b)}`);

/**
 * The Overview's numbers, shaped for the two mockups. The queries are
 * phase 32's, unchanged; the only new arithmetic is the chart's trailing
 * 7-day window, summed here from the daily series (asked for six days
 * earlier, never before the log began, so the first points are whole).
 */
export async function loadOverview(searchParams: AdminSearchParams): Promise<OverviewVm> {
  const sp = await searchParams;
  const r = resolveRange({ range: param(sp, "range"), from: param(sp, "from"), to: param(sp, "to") });
  const db = await getDb();
  const rolling = r.days > DAILY_MAX;
  const lead = addDays(r.chartFrom, -(WINDOW - 1));
  const seriesFrom = !rolling || r.chartFrom < CUTOVER_DATE ? r.chartFrom : lead < CUTOVER_DATE ? CUTOVER_DATE : lead;
  const [o, daily, st, posts, numbers, pending] = await Promise.all([
    overviewMetrics(db, r),
    activitySeries(db, { ...r, bucket: "day", chartFrom: seriesFrom }),
    sourcesAndTargets(db, r),
    adminPosts(db),
    listingNumbers(db, r),
    listPendingAccessRequests(db),
  ]);

  const postedOn = new Map<string, number>();
  for (const p of posts) {
    if (p.legacyImport) continue;
    const day = easternDate(p.postedAt);
    postedOn.set(day, (postedOn.get(day) ?? 0) + 1);
  }
  const days = daily.map((d) => ({ day: d.day, out: d.views.signed_out, in: d.views.signed_in, contacts: d.contacts, listings: postedOn.get(d.day) ?? 0 }));
  const sum = (from: number, to: number, pick: (d: (typeof days)[number]) => number) => days.slice(Math.max(0, from), to + 1).reduce((t, d) => t + pick(d), 0);
  const points = days
    .map((d, i) => {
      const a = rolling ? i - (WINDOW - 1) : i;
      const signedIn = sum(a, i, (x) => x.in);
      const contacts = sum(a, i, (x) => x.contacts);
      return {
        day: d.day,
        when: rolling ? `${WINDOW} days to ${dayLabel(d.day)}` : dayLabel(d.day, true),
        tick: dayLabel(d.day),
        out: sum(a, i, (x) => x.out),
        in: signedIn,
        contacts,
        listings: sum(a, i, (x) => x.listings),
        rate: signedIn > 0 ? Math.min(100, Math.round((contacts / signedIn) * 100)) : null,
      };
    })
    .filter((p) => p.day >= r.chartFrom);

  const out = o.views.signed_out;
  const signedIn = o.views.signed_in;
  const views = out.cur + signedIn.cur;
  const viewsPrev = r.prev ? (out.prev ?? 0) + (signedIn.prev ?? 0) : null;
  const pctOf = (n: number, of: number) => (of > 0 ? (n / of) * 100 : null);
  const rate = pctOf(o.contacts.cur, o.signedInViewers.cur);
  const ratePrev = o.contacts.prev === null || o.signedInViewers.prev === null ? null : pctOf(o.contacts.prev, o.signedInViewers.prev);

  const kpis: Kpi[] = [
    {
      key: "views",
      label: "Views",
      value: fmt(views),
      chip: countChip(views, viewsPrev),
      tip: `${fmt(out.cur)} signed out, ${fmt(signedIn.cur)} signed in. A view is one person opening one listing on one Eastern day.`,
      series: points.map((p) => p.out + p.in),
      unit: "count",
      split: [
        { label: "Signed out", n: out.cur },
        { label: "Signed in", n: signedIn.cur },
      ],
    },
    {
      key: "contacts",
      label: "Got in touch",
      value: fmt(o.contacts.cur),
      chip: countChip(o.contacts.cur, o.contacts.prev),
      tip: `People who got in touch about a listing, counted once per listing. ${fmt(o.taps.cur)} taps in all (copy, call, text, mail app).`,
      series: points.map((p) => p.contacts),
      unit: "count",
    },
    {
      key: "rate",
      label: "View → contact",
      value: rate === null ? "—" : `${Math.round(rate)}%`,
      chip: rateChip(rate, ratePrev, o.signedInViewers.prev),
      tip: `${fmt(o.contacts.cur)} of ${fmt(o.signedInViewers.cur)} signed-in viewers got in touch. Signed-out visitors can't, so they aren't in it.`,
      series: points.map((p) => p.rate),
      unit: "percent",
    },
    {
      key: "listings",
      label: "New listings",
      value: fmt(o.newListings.cur),
      chip: countChip(o.newListings.cur, o.newListings.prev),
      tip: "Posted in the range. Listings carried over from the old site aren't counted.",
      series: points.map((p) => p.listings),
      unit: "count",
    },
  ];

  const stat = (label: string, n: number, more: Partial<Stat> = {}): Stat => ({ label, value: fmt(n), zero: n === 0, ...more });
  const arrivalsOut = o.shareArrivals.signed_out;
  const arrivalsIn = o.shareArrivals.signed_in;
  const arrivals = arrivalsOut.cur + arrivalsIn.cur;
  const arrivalsPrev = r.prev ? (arrivalsOut.prev ?? 0) + (arrivalsIn.prev ?? 0) : null;
  const filled = pctOf(o.outcomes.throughSite.cur, o.outcomes.answered.cur);

  const attention = listingRows(posts, numbers).filter((x) => x.flags.length > 0);
  const q = rangeQuery(r);

  return {
    range: {
      key: r.key,
      from: r.from,
      to: r.to,
      caption: r.key === "all" ? "All time" : r.key === "cutover" ? `Since ${dayLabel(r.from)}` : r.prev ? `${span(r.from, r.to)} · vs ${span(r.prev.from, r.prev.to)}` : span(r.from, r.to),
      captionTip: r.prev ? "Whole Eastern days. Every change is against the same number of days just before." : "Whole Eastern days. This range has nothing before it to compare with.",
    },
    mode: rolling ? "rolling" : "day",
    points: points.map((p) => ({ day: p.day, when: p.when, tick: p.tick, out: p.out, in: p.in })),
    kpis,
    groups: [
      {
        title: "Board",
        stats: [
          stat("On the board", o.board.open, { tip: "Open, visible, with a photo, right now." }),
          stat("Public", o.board.public, { tip: "Also on the signed-out board (needs its approximate area)." }),
          stat("Students only", o.board.studentsOnly, { tip: "Kept to signed-in students by the poster." }),
        ],
      },
      {
        title: "Audience",
        stats: [
          stat("New accounts", o.newAccounts.cur, { chip: countChip(o.newAccounts.cur, o.newAccounts.prev), tip: "Not counting migrated accounts or the admin." }),
          stat("Share arrivals", arrivals, { chip: countChip(arrivals, arrivalsPrev), tip: `${fmt(arrivalsOut.cur)} signed out, ${fmt(arrivalsIn.cur)} signed in. Someone who arrives signed out and then signs in counts once in each.` }),
          stat("Saved searches", o.savedSearches.added.cur, { chip: countChip(o.savedSearches.added.cur, o.savedSearches.added.prev), tip: `Added in the range. ${fmt(o.savedSearches.total)} saved in all.` }),
          stat("Digest subscribers", o.digest.subscribed, { tip: `Subscribed now. In the range ${fmt(o.digest.joined.cur)} joined and ${fmt(o.digest.left.cur)} left.` }),
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
      { label: "Views, signed out", n: out.cur, tip: "People-days." },
      { label: "New accounts", n: o.newAccounts.cur, tip: "Not migrated, not the admin." },
      { label: "Views, signed in", n: signedIn.cur, tip: "People-days." },
      { label: "Got in touch", n: o.contacts.cur, tip: "A person per listing." },
      { label: "Filled through us", n: o.outcomes.throughSite.cur, tip: "Posters' answers." },
    ],
    sources: st.sources.map((x) => ({ label: SOURCE_LABELS[x.key] ?? x.key, n: x.n })),
    targets: st.targets.map((x) => ({ label: TARGET_LABELS[x.key] ?? x.key, n: x.n })),
    attention: {
      total: attention.length,
      href: `/admin/listings?${q}&view=attention`,
      rows: attention.slice(0, 5).map((a) => ({
        id: a.id,
        label: a.label,
        href: `/admin/listings?${q}#post:${a.id}`,
        flags: a.flags.map((f) => ({ short: FLAG_SHORT[f as AttentionFlag], long: ATTENTION[f as AttentionFlag] })),
      })),
    },
    nav: { waiting: pending.length, query: q },
  };
}
