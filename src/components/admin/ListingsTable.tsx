"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ATTENTION, type AttentionFlag } from "@/lib/admin-attention";
import { shortDate } from "@/lib/dates";
import { useAdmin } from "./AdminShell";
import { CsvButton } from "./CsvButton";
import { SortHeader, useSort } from "./SortHeader";
import type { SortDir } from "./sort";
import type { ListingRowDto } from "./types";

type Key = "listing" | "poster" | "status" | "audience" | "age" | "views" | "contacts" | "converted" | "shares" | "confirmed";
const COLUMNS: { key: Key; label: string; firstDir: SortDir; wide?: boolean }[] = [
  { key: "listing", label: "Listing", firstDir: "asc" },
  { key: "poster", label: "Poster", firstDir: "asc", wide: true },
  { key: "status", label: "Status", firstDir: "asc" },
  { key: "audience", label: "Seen by", firstDir: "asc", wide: true },
  { key: "age", label: "Age", firstDir: "desc" },
  { key: "views", label: "Views", firstDir: "desc" },
  { key: "contacts", label: "Contacts", firstDir: "desc" },
  { key: "converted", label: "Converted", firstDir: "desc", wide: true },
  { key: "shares", label: "Shares", firstDir: "desc", wide: true },
  { key: "confirmed", label: "Confirmed", firstDir: "desc", wide: true },
];
const value = (r: ListingRowDto, k: Key) =>
  k === "listing"
    ? r.label
    : k === "poster"
      ? (r.ownerName ?? r.ownerEmail)
      : k === "status"
        ? statusText(r)
        : k === "audience"
          ? r.deleted
            ? null
            : r.studentsOnly
              ? "Students"
              : "Public"
          : k === "age"
            ? r.ageDays
            : k === "confirmed"
              ? r.confirmedAvailableAt
              : r[k];

function statusText(r: ListingRowDto): string {
  if (r.deleted) return "deleted";
  if (r.status !== "open") return r.status;
  if (r.hidden) return "hidden";
  return r.onBoard ? "on board" : "open, off board";
}

const STATUSES = ["all", "on board", "open", "paused", "taken", "hidden", "deleted"] as const;

/**
 * Every listing with its numbers in the range: filter, sort, open one in the
 * listing view, or download what's shown as CSV. Cards on a phone. Views
 * are people-days; contacts, people who got in touch.
 */
export function ListingsTable({ rows, initialAttention = false }: { rows: ListingRowDto[]; initialAttention?: boolean }) {
  const { openPost, href } = useAdmin();
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("all");
  const [semester, setSemester] = useState("");
  const [audience, setAudience] = useState<"" | "public" | "students">("");
  const [attention, setAttention] = useState<"" | "any" | AttentionFlag>(initialAttention ? "any" : "");

  const semesters = useMemo(() => [...new Map(rows.filter((r) => r.firstSemester).map((r) => [r.firstSemester!, r.semesterLabel])).entries()], [rows]);
  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        const st = statusText(r);
        if (status !== "all" && !(status === "open" ? r.status === "open" && !r.deleted : st === status)) return false;
        if (semester && r.firstSemester !== semester) return false;
        if (audience && (r.deleted || (audience === "students") !== r.studentsOnly)) return false;
        if (attention === "any" ? r.flags.length === 0 : attention && !r.flags.includes(attention)) return false;
        return true;
      }),
    [rows, status, semester, audience, attention],
  );
  const { sorted, sort, onSort } = useSort<ListingRowDto, Key>(filtered, value, { key: "views", dir: "desc" });

  const csv = sorted.map((r) => ({
    id: r.id,
    listing: r.label,
    poster: r.ownerName ?? r.ownerEmail ?? "",
    email: r.ownerEmail ?? "",
    status: statusText(r),
    seen_by: r.deleted ? "" : r.studentsOnly ? "students" : "public",
    semesters: r.semesterLabel,
    posted: r.postedAt?.slice(0, 10) ?? "",
    age_days: r.ageDays,
    confirmed_available: r.confirmedAvailableAt?.slice(0, 10) ?? "",
    photos: r.photos,
    views: r.views,
    contacts: r.contacts,
    converted: r.converted,
    shares: r.shares,
    share_arrivals: r.arrivals,
    views_last_14_days: r.views14,
    attention: r.flags.map((f) => ATTENTION[f as AttentionFlag] ?? f).join("; "),
  }));

  const select = "field min-h-10 py-1.5 text-sm";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-ink-3">
          Status
          <select className={select} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s === "all" ? "All" : s[0].toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-3">
          First semester
          <select className={select} value={semester} onChange={(e) => setSemester(e.target.value)}>
            <option value="">All</option>
            {semesters.map(([code, label]) => (
              <option key={code} value={code}>
                {label.split(" & ")[0] || code}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-3">
          Seen by
          <select className={select} value={audience} onChange={(e) => setAudience(e.target.value as typeof audience)}>
            <option value="">Anyone</option>
            <option value="public">Public</option>
            <option value="students">Students only</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-3">
          Needs attention
          <select className={select} value={attention} onChange={(e) => setAttention(e.target.value as typeof attention)}>
            <option value="">Don&apos;t filter</option>
            <option value="any">Any reason</option>
            {(Object.keys(ATTENTION) as AttentionFlag[]).map((f) => (
              <option key={f} value={f}>
                {ATTENTION[f]}
              </option>
            ))}
          </select>
        </label>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm text-ink-3 tabular-nums">
            {sorted.length} of {rows.length}
          </span>
          <CsvButton
            name="listings"
            columns={Object.keys(csv[0] ?? { id: 0 }).map((k) => ({ key: k, label: k }))}
            rows={csv}
          />
        </div>
      </div>

      {/* Phone: one card per listing. */}
      <ul className="flex flex-col gap-2 md:hidden">
        {sorted.map((r) => (
          <li key={r.id} className="rounded-lg border border-line bg-paper p-3">
            <div className="flex items-start justify-between gap-2">
              {r.deleted ? (
                <span className="font-bold text-ink-3">{r.label}</span>
              ) : (
                <button type="button" className="link min-h-6 text-left font-bold" onClick={() => void openPost(r.id)}>
                  {r.label}
                </button>
              )}
              <span className="shrink-0 text-xs text-ink-3">{statusText(r)}</span>
            </div>
            {!r.deleted && (
              <p className="text-xs text-ink-3">
                #{r.id} · {r.ownerId ? <Link className="link" href={href(`/admin/people#people:${r.ownerId}`)}>{r.ownerName ?? r.ownerEmail}</Link> : "—"} · {r.studentsOnly ? "Students" : "Public"} · {r.semesterLabel} · {r.ageDays}d
              </p>
            )}
            <dl className="mt-2 grid grid-cols-4 gap-1 text-center text-xs">
              {(
                [
                  ["Views", r.views],
                  ["Contacts", r.contacts],
                  ["Shares", r.shares],
                  ["Photos", r.photos],
                ] as const
              ).map(([k, n]) => (
                <div key={k} className="rounded bg-cream py-1">
                  <dt className="text-ink-3">{k}</dt>
                  <dd className="font-bold tabular-nums">{n}</dd>
                </div>
              ))}
            </dl>
            {r.flags.length > 0 && <p className="mt-2 text-xs text-maple-ink">{r.flags.map((f) => ATTENTION[f as AttentionFlag] ?? f).join(" · ")}</p>}
          </li>
        ))}
      </ul>

      {/* Desktop: the table. */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-ink-3">
            <tr>
              {COLUMNS.map((c) => (
                <SortHeader key={c.key} label={c.label} column={c.key} sort={sort} onSort={onSort} firstDir={c.firstDir} className={c.wide ? "hidden lg:table-cell" : ""} />
              ))}
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {sorted.map((r) => (
              <tr key={r.id} className="border-t border-line-light align-top">
                <td className="py-1.5 pr-3">
                  {r.deleted ? (
                    <span className="text-ink-3">{r.label}</span>
                  ) : (
                    <button type="button" className="link text-left" onClick={() => void openPost(r.id)}>
                      {r.label}
                    </button>
                  )}
                  {r.flags.length > 0 && <div className="text-xs text-maple-ink">{r.flags.map((f) => ATTENTION[f as AttentionFlag] ?? f).join(" · ")}</div>}
                </td>
                <td className="hidden py-1.5 pr-3 lg:table-cell">
                  {r.ownerId ? (
                    <Link href={href(`/admin/people#people:${r.ownerId}`)} className="link" title={r.ownerEmail ?? undefined}>
                      {r.ownerName ?? r.ownerEmail}
                    </Link>
                  ) : (
                    <span className="text-ink-3">—</span>
                  )}
                </td>
                <td className="py-1.5 pr-3 whitespace-nowrap">{statusText(r)}</td>
                <td className="hidden py-1.5 pr-3 lg:table-cell">{r.deleted ? "" : r.studentsOnly ? "Students" : "Public"}</td>
                <td className="py-1.5 pr-3">{r.ageDays === null ? "" : `${r.ageDays}d`}</td>
                <td className="py-1.5 pr-3">{r.views}</td>
                <td className="py-1.5 pr-3">{r.contacts}</td>
                <td className="hidden py-1.5 pr-3 lg:table-cell">{r.converted}</td>
                <td className="hidden py-1.5 pr-3 lg:table-cell">{r.shares}</td>
                <td className="hidden py-1.5 lg:table-cell">{r.confirmedAvailableAt ? shortDate(new Date(r.confirmedAvailableAt)) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sorted.length === 0 && <p className="text-sm text-ink-3">No listings match.</p>}
    </div>
  );
}
