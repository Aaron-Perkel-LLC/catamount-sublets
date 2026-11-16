"use client";

import Link from "next/link";
import { OUTCOMES, type Outcome } from "@/lib/listing-outcome";
import type { ActivityDto } from "./AdminTabs";
import { BarList } from "./BarList";
import { DailyChart } from "./DailyChart";
import { SortHeader, useSort } from "./SortHeader";
import type { SortDir } from "./sort";

const RANGES = [
  ["open", "Open semesters"],
  ["30d", "Last 30 days"],
  ["all", "All time"],
] as const;

/** EVENT_SOURCES and SHARE_TARGETS (src/lib/options.ts) as people say them. */
const SOURCE_LABELS: Record<string, string> = { browse: "Browse", map: "Map", "share-link": "Share link", deeplink: "Direct link", post: "Post page" };
const TARGET_LABELS: Record<string, string> = { native: "Share sheet", instagram: "Instagram", snapchat: "Snapchat", text: "Text", email: "Email", x: "X", copy: "Copy link" };

type Row = ActivityDto["perListing"][number];
type Key = "listing" | "poster" | "views" | "contacts" | "converted" | "shares" | "arrivals";
const COLUMNS: { key: Key; label: string; firstDir: SortDir; wide?: boolean }[] = [
  { key: "listing", label: "Listing", firstDir: "asc" },
  { key: "poster", label: "Poster", firstDir: "asc" },
  { key: "views", label: "Viewed", firstDir: "desc" },
  { key: "contacts", label: "Contacts", firstDir: "desc" },
  { key: "converted", label: "Converted", firstDir: "desc", wide: true },
  { key: "shares", label: "Shares", firstDir: "desc" },
  { key: "arrivals", label: "Arrivals", firstDir: "desc", wide: true },
];
const value = (l: Row, k: Key) => (k === "listing" ? l.shortAddress : k === "poster" ? (l.ownerName ?? l.ownerEmail) : l[k]);

/** Totals, a daily chart, where views start, where shares go, and every listing's numbers. */
export function ActivityTab({ activity, onOpenPost }: { activity: ActivityDto; onOpenPost: (id: number) => void }) {
  const totals = activity.perListing.reduce(
    (t, l) => ({ views: t.views + l.views, contacts: t.contacts + l.contacts, converted: t.converted + l.converted, shares: t.shares + l.shares, arrivals: t.arrivals + l.arrivals }),
    { views: 0, contacts: 0, converted: 0, shares: 0, arrivals: 0 },
  );
  const conversion = totals.views ? Math.round((totals.converted / totals.views) * 100) : 0;
  const { sorted, sort, onSort } = useSort<Row, Key>(activity.perListing, value, { key: "views", dir: "desc" });

  return (
    <div className="flex flex-col gap-5">
      <nav className="flex flex-wrap gap-2 text-sm" aria-label="Range">
        {RANGES.map(([key, label]) => (
          <Link key={key} href={`/admin?range=${key}#activity`} className={`rounded-full border px-3 py-1 ${activity.range === key ? "border-lake bg-lake text-paper" : "border-line"}`}>
            {label}
          </Link>
        ))}
      </nav>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[
          ["People viewed", totals.views],
          ["Got in touch", totals.contacts],
          ["Conversion", `${conversion}%`],
          ["Share taps", totals.shares],
          ["Arrived by share", totals.arrivals],
        ].map(([label, n]) => (
          <div key={String(label)} className="rounded-lg border border-line bg-paper px-3 py-2">
            <div className="text-xs text-ink-3">{label}</div>
            <div className="text-lg font-bold">{n}</div>
          </div>
        ))}
      </div>

      <OutcomesCard outcomes={activity.outcomes} />

      <figure className="flex flex-col gap-2 rounded-xl border border-line bg-paper p-4">
        <figcaption className="text-sm">
          <span className="font-bold">Per day</span> <span className="text-ink-3">· last {activity.daily.length} days, Eastern time</span>
        </figcaption>
        <DailyChart days={activity.daily} />
      </figure>

      <div className="grid gap-4 sm:grid-cols-2">
        <BarList title="Where views start" rows={activity.sources.map((s) => ({ label: SOURCE_LABELS[s.source] ?? s.source, n: s.n }))} />
        <BarList title="Where shares go" rows={activity.targets.map((t) => ({ label: TARGET_LABELS[t.target] ?? t.target, n: t.n }))} />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-ink-3">
            <tr>
              {COLUMNS.map((c) => (
                <SortHeader key={c.key} label={c.label} column={c.key} sort={sort} onSort={onSort} firstDir={c.firstDir} className={c.wide ? "hidden md:table-cell" : ""} />
              ))}
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {sorted.map((l) => (
              <tr key={l.id} className="border-t border-line-light align-top">
                <td className="py-1.5 pr-3">
                  <button type="button" className="link text-left text-sm" onClick={() => onOpenPost(l.id)}>
                    {l.shortAddress}
                  </button>
                  {l.status !== "open" && <span className="ml-1 text-xs text-ink-3">({l.status})</span>}
                  {l.hidden && <span className="ml-1 text-xs text-ink-3">(hidden)</span>}
                </td>
                <td className="py-1.5 pr-3">
                  <a href={`#people:${l.ownerId}`} className="link" title={l.ownerEmail}>
                    {l.ownerName ?? l.ownerEmail}
                  </a>
                </td>
                <td className="py-1.5 pr-3">{l.views}</td>
                <td className="py-1.5 pr-3">{l.contacts}</td>
                <td className="hidden py-1.5 pr-3 md:table-cell">{l.converted}</td>
                <td className="py-1.5 pr-3">{l.shares}</td>
                <td className="hidden py-1.5 md:table-cell">{l.arrivals}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


const OUTCOME_ORDER: Outcome[] = ["through_site", "elsewhere", "not_filled", "still_available", "skipped"];

/**
 * How listings ended, from the posters' own answers (on delete and from the
 * "still available?" email), over all time: the range above does not apply,
 * because answers outlive their listings. "Filled through us" is a share of
 * the answers that say how it ended, so Still available and Skipped are left
 * out of it.
 */
function OutcomesCard({ outcomes }: { outcomes: ActivityDto["outcomes"] }) {
  const { counts, answered, throughSitePct, asked, askedAnswered } = outcomes;
  return (
    <section aria-labelledby="outcomes-heading" className="flex flex-col gap-3 rounded-xl border border-line bg-paper p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 id="outcomes-heading" className="text-sm">
          <span className="font-bold">How listings ended</span> <span className="text-ink-3">· posters&apos; answers, all time</span>
        </h3>
        <p className="text-sm">
          <span className="text-lg font-bold">{throughSitePct === null ? "—" : `${throughSitePct}%`}</span>{" "}
          <span className="text-ink-3">filled through us, of {answered} answered</span>
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {OUTCOME_ORDER.map((o) => (
          <div key={o} className="rounded-lg border border-line-light px-3 py-2">
            <dt className="text-xs text-ink-3">{OUTCOMES[o]}</dt>
            <dd className="text-lg font-bold tabular-nums">{counts[o]}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-ink-3">
        {asked === 0 ? "The “still available?” email has not been sent yet (Semesters → Ask posters)." : `Email: ${askedAnswered} of ${asked} asked have said how it ended.`}
      </p>
    </section>
  );
}
