import Link from "next/link";
import { BarList } from "@/components/admin/BarList";
import { CsvButton } from "@/components/admin/CsvButton";
import { LegacyHashRedirect } from "@/components/admin/LegacyHashRedirect";
import { LineChart } from "@/components/admin/LineChart";
import { Panel } from "@/components/admin/Panel";
import { RangePicker } from "@/components/admin/RangePicker";
import { StatTile } from "@/components/admin/StatTile";
import { getDb } from "@/db";
import { ATTENTION, type AttentionFlag } from "@/lib/admin-attention";
import { rate } from "@/lib/admin-delta";
import { type AdminSearchParams, param, rangeDto } from "@/lib/admin-page";
import { rangeQuery, resolveRange } from "@/lib/admin-range";
import { VIEWER_SEGMENTS } from "@/lib/viewer-segment";
import { requireAdminPage } from "@/server/auth";
import { adminPosts, listingRows } from "@/server/data/admin-listings";
import { activitySeries, listingNumbers, overviewMetrics, sourcesAndTargets } from "@/server/data/admin-metrics";

/** EVENT_SOURCES and SHARE_TARGETS (src/lib/options.ts) as people say them. */
const SOURCE_LABELS: Record<string, string> = { browse: "Browse", map: "Map", "share-link": "Share link", deeplink: "Direct link", post: "Post page", unknown: "Not recorded" };
const TARGET_LABELS: Record<string, string> = { native: "Share sheet", instagram: "Instagram", snapchat: "Snapchat", text: "Text", email: "Email", x: "X", copy: "Copy link", unknown: "Not recorded" };

/** The admin's landing page: the range's numbers against the period before, the chart, the funnel and what needs a look. */
export default async function AdminOverview({ searchParams }: { searchParams: AdminSearchParams }) {
  await requireAdminPage("/admin");
  const sp = await searchParams;
  const r = resolveRange({ range: param(sp, "range"), from: param(sp, "from"), to: param(sp, "to") });
  const db = await getDb();
  const [o, series, st, posts, numbers] = await Promise.all([overviewMetrics(db, r), activitySeries(db, r), sourcesAndTargets(db, r), adminPosts(db), listingNumbers(db, r)]);
  const attention = listingRows(posts, numbers).filter((x) => x.flags.length > 0);

  const views = VIEWER_SEGMENTS.map((s) => ({ ...s, ...o.views[s.key] }));
  const arrivals = VIEWER_SEGMENTS.map((s) => ({ ...s, ...o.shareArrivals[s.key] }));
  const totalArrivals = arrivals.reduce((t, a) => t + a.cur, 0);
  const totalArrivalsPrev = r.prev ? arrivals.reduce((t, a) => t + (a.prev ?? 0), 0) : null;
  const contactRate = o.signedInViewers.cur ? `${Math.round((o.contacts.cur / o.signedInViewers.cur) * 100)}%` : "—";
  const filledPct = o.outcomes.answered.cur ? Math.round((o.outcomes.throughSite.cur / o.outcomes.answered.cur) * 100) : null;
  const q = rangeQuery(r);

  const signedOut = o.views.signed_out?.cur ?? 0;
  const signedIn = o.views.signed_in?.cur ?? 0;
  const funnel = [
    { label: "Listing views, signed out", n: signedOut, note: "people-days" },
    { label: "New accounts", n: o.newAccounts.cur, note: "not migrated, not the admin" },
    { label: "Listing views, signed in", n: signedIn, note: "people-days" },
    { label: "Got in touch", n: o.contacts.cur, note: "a person per listing" },
    { label: "Filled through this site", n: o.outcomes.throughSite.cur, note: "posters' answers" },
  ];
  const funnelMax = Math.max(1, ...funnel.map((f) => f.n));

  return (
    <div className="flex flex-col gap-5">
      <LegacyHashRedirect />
      <RangePicker range={rangeDto(r)} />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        <StatTile label="On the board now" value={o.board.open} sub={`${o.board.public} public · ${o.board.studentsOnly} students only`} />
        <StatTile label="New listings" value={o.newListings.cur} prev={o.newListings.prev} />
        <StatTile label="New accounts" value={o.newAccounts.cur} prev={o.newAccounts.prev} title="Not counting migrated accounts or the admin" />
        {views.map((v) => (
          <StatTile key={v.key} label={`Views, ${v.label.toLowerCase()}`} value={v.cur} prev={v.prev} title="People-days: one person, one listing, one Eastern day" />
        ))}
        <StatTile label="Got in touch" value={o.contacts.cur} prev={o.contacts.prev} sub={`${o.taps.cur} taps`} title="People who got in touch about a listing (each counts once per listing); taps are every copy, call, text and mail-app tap" />
        <StatTile label="View → contact" value={contactRate} sub={`${o.contacts.cur} of ${o.signedInViewers.cur} signed-in viewers`} title="Signed-out visitors can't get in touch, so this divides by signed-in viewers (a person per listing)" />
        <StatTile label="Share arrivals" value={totalArrivals} prev={totalArrivalsPrev} sub={arrivals.map((a) => `${a.cur} ${a.label.toLowerCase()}`).join(" · ")} />
        <StatTile label="Saved searches added" value={o.savedSearches.added.cur} prev={o.savedSearches.added.prev} sub={`${o.savedSearches.total} saved in all`} />
        <StatTile label="Digest subscribers" value={o.digest.subscribed} sub={`+${o.digest.joined.cur} joined · −${o.digest.left.cur} left`} title="Now; joined and left are in the range (left is each subscription's current state)" />
        <StatTile label="Outcomes answered" value={o.outcomes.answered.cur} prev={o.outcomes.answered.prev} sub={filledPct === null ? "none filled yet" : `${filledPct}% filled through us`} />
      </div>

      <Panel title="Views and contacts" hint={`By ${r.bucket === "day" ? "Eastern day" : "week (Monday to Sunday, Eastern)"}. Views are people-days; got in touch is people per listing.`}>
        <LineChart
          label="Views and contacts"
          bucket={r.bucket}
          series={[...VIEWER_SEGMENTS.map((s) => ({ key: s.key, label: `Views, ${s.label.toLowerCase()}`, color: s.color })), { key: "contacts", label: "Got in touch", color: "var(--color-ink-2)", dashed: true }]}
          points={series.map((p) => ({ day: p.day, values: { ...p.views, contacts: p.contacts } }))}
        />
      </Panel>

      <Panel
        title="Funnel"
        hint="Each step is a separate count over the same range, not the same people followed through: signed-out views and signed-in views are different visits, and a person who signs in is a new code. With these numbers, read it as orders of magnitude."
      >
        <ol className="flex flex-col gap-1.5 text-sm">
          {funnel.map((f, i) => (
            <li key={f.label} className="grid grid-cols-[minmax(0,9rem)_1fr] items-center gap-2 sm:grid-cols-[14rem_1fr]">
              <span className="leading-snug text-ink-2">
                {i + 1}. {f.label}
                <span className="block text-xs text-ink-3">{f.note}</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="h-3 rounded-r bg-chart-lake" style={{ width: `${(f.n / funnelMax) * 100}%`, minWidth: 2 }} aria-hidden />
                <span className="font-bold tabular-nums">{f.n}</span>
              </span>
            </li>
          ))}
        </ol>
        <p className="text-xs text-ink-3">
          Arrived by a share link: {arrivals.map((a) => `${a.cur} ${a.label.toLowerCase()}`).join(", ")}. Contact rate (signed in): {rate(o.contacts.cur, o.signedInViewers.cur)}.
        </p>
      </Panel>

      <div className="grid gap-3 md:grid-cols-2">
        <BarList title="Where views start" rows={st.sources.map((x) => ({ label: SOURCE_LABELS[x.key] ?? x.key, n: x.n }))} empty="No views in this range." />
        <BarList title="Where shares go" rows={st.targets.map((x) => ({ label: TARGET_LABELS[x.key] ?? x.key, n: x.n }))} empty="No shares in this range." />
      </div>

      <Panel
        title="Needs attention"
        hint="No views in 14 days (posted 3+ days ago) · 60+ days old and never confirmed available · 3+ views in the range and no contacts."
        actions={
          <>
            <CsvButton
              name="needs-attention"
              columns={[
                { key: "id", label: "id" },
                { key: "listing", label: "listing" },
                { key: "reasons", label: "reasons" },
                { key: "views", label: "views" },
                { key: "contacts", label: "contacts" },
                { key: "age", label: "age_days" },
              ]}
              rows={attention.map((a) => ({ id: a.id, listing: a.label, reasons: a.flags.map((f) => ATTENTION[f as AttentionFlag]).join("; "), views: a.views, contacts: a.contacts, age: a.ageDays }))}
            />
          </>
        }
      >
        {attention.length === 0 ? (
          <p className="text-sm text-ink-3">Nothing needs a look.</p>
        ) : (
          <>
            <ul className="flex flex-col divide-y divide-line-light text-sm">
              {attention.slice(0, 5).map((a) => (
                <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2">
                  <Link href={`/admin/listings?${q}#post:${a.id}`} className="link font-bold">
                    #{a.id} {a.label}
                  </Link>
                  <span className="text-xs text-maple-ink">{a.flags.map((f) => ATTENTION[f as AttentionFlag]).join(" · ")}</span>
                </li>
              ))}
            </ul>
            <Link href={`/admin/listings?${q}&view=attention`} className="link self-start text-sm">
              All {attention.length} in All listings
            </Link>
          </>
        )}
      </Panel>
    </div>
  );
}
