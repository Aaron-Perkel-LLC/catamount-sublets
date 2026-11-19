"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ATTENTION, type AttentionFlag } from "@/lib/admin-attention";
import { shortDate } from "@/lib/dates";
import { useAdmin } from "./AdminShell";
import { CsvButton } from "./CsvButton";
import { type Column, DataTable, Flags, Num } from "./DataTable";
import { Pill, type PillTone } from "./Pill";
import type { ListingRowDto } from "./types";
import { LINK, MUTED, SELECT } from "./ui";
import { useSort } from "./useSort";

type Key = "listing" | "poster" | "status" | "audience" | "age" | "views" | "contacts" | "converted" | "shares" | "confirmed";
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
const STATUS_TONE: Record<string, PillTone> = { "on board": "good", "open, off board": "warn", taken: "info" };
/** The attention flags, short enough for a row; the full wording is the hover. */
const FLAG_SHORT: Record<AttentionFlag, string> = { "no-views": "No views", unconfirmed: "Unconfirmed", "no-contacts": "No contacts" };
const flagsOf = (r: ListingRowDto) => r.flags.map((f) => ({ short: FLAG_SHORT[f as AttentionFlag] ?? f, long: ATTENTION[f as AttentionFlag] ?? f }));
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/**
 * Every listing with its numbers in the range: filter, sort, open one in the
 * listing view, or download what's shown as CSV. A card per listing on a
 * phone. Views are people-days; contacts, people who got in touch.
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

  const columns: Column<ListingRowDto, Key>[] = [
    {
      key: "listing",
      header: "Listing",
      primary: true,
      sort: "listing",
      cell: (r) => (
        <span className="flex flex-col gap-0.5">
          {r.deleted ? (
            <span className="text-ink-3">{r.label}</span>
          ) : (
            <button type="button" className={`${LINK} text-left`} onClick={() => void openPost(r.id)}>
              {r.label}
            </button>
          )}
          <Flags flags={flagsOf(r)} />
        </span>
      ),
    },
    {
      key: "poster",
      header: "Poster",
      wide: true,
      sort: "poster",
      cell: (r) =>
        r.ownerId ? (
          <Link href={href(`/admin/people#people:${r.ownerId}`)} className={LINK} title={r.ownerEmail ?? undefined}>
            {r.ownerName ?? r.ownerEmail}
          </Link>
        ) : null,
    },
    { key: "status", header: "Status", sort: "status", cell: (r) => <Pill tone={STATUS_TONE[statusText(r)] ?? "muted"}>{cap(statusText(r))}</Pill> },
    { key: "audience", header: "Seen by", wide: true, sort: "audience", cell: (r) => (r.deleted ? null : r.studentsOnly ? "Students" : "Public") },
    { key: "semesters", header: "For", wide: true, cell: (r) => r.semesterLabel || null },
    { key: "age", header: "Age", numeric: true, sort: "age", cell: (r) => (r.ageDays === null ? null : `${r.ageDays}d`) },
    { key: "views", header: "Views", numeric: true, sort: "views", cell: (r) => <Num n={r.views} /> },
    { key: "contacts", header: "Contacts", numeric: true, sort: "contacts", cell: (r) => <Num n={r.contacts} /> },
    { key: "converted", header: "Converted", numeric: true, wide: true, sort: "converted", cell: (r) => <Num n={r.converted} /> },
    { key: "shares", header: "Shares", numeric: true, wide: true, sort: "shares", cell: (r) => <Num n={r.shares} /> },
    { key: "confirmed", header: "Confirmed", numeric: true, wide: true, sort: "confirmed", cell: (r) => (r.confirmedAvailableAt ? shortDate(new Date(r.confirmedAvailableAt)) : null) },
  ];

  const select = `${SELECT} md:w-auto`;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 px-4">
        <div className="grid w-full grid-cols-2 gap-2 md:flex md:w-auto">
          <select aria-label="Status" className={select} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s === "all" ? "Any status" : cap(s)}
              </option>
            ))}
          </select>
          <select aria-label="First semester" className={select} value={semester} onChange={(e) => setSemester(e.target.value)}>
            <option value="">Any semester</option>
            {semesters.map(([code, label]) => (
              <option key={code} value={code}>
                {label.split(" & ")[0] || code}
              </option>
            ))}
          </select>
          <select aria-label="Seen by" className={select} value={audience} onChange={(e) => setAudience(e.target.value as typeof audience)}>
            <option value="">Seen by anyone</option>
            <option value="public">Public</option>
            <option value="students">Students only</option>
          </select>
          <select aria-label="Needs attention" className={select} value={attention} onChange={(e) => setAttention(e.target.value as typeof attention)}>
            <option value="">All listings</option>
            <option value="any">Needs attention</option>
            {(Object.keys(ATTENTION) as AttentionFlag[]).map((f) => (
              <option key={f} value={f}>
                {ATTENTION[f]}
              </option>
            ))}
          </select>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className={`${MUTED} tabular-nums`}>
            {sorted.length} of {rows.length}
          </span>
          <CsvButton name="listings" columns={Object.keys(csv[0] ?? { id: 0 }).map((k) => ({ key: k, label: k }))} rows={csv} />
        </div>
      </div>
      <DataTable label="Listings" columns={columns} rows={sorted} rowKey={(r) => r.id} sort={sort} onSort={onSort} empty="No listings match." />
    </div>
  );
}
