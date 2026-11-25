"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ATTENTION, ATTENTION_SHORT, type AttentionFlag } from "@/lib/admin-attention";
import { shortAge, shortDate } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import { useAdmin } from "./AdminShell";
import { CsvButton } from "./CsvButton";
import { type Column, DataTable, Flags, Num } from "./DataTable";
import { Pill, type PillTone } from "./Pill";
import { SegmentedControl } from "./SegmentedControl";
import type { ListingRowDto } from "./types";
import { LINK, MUTED, SELECT_SM } from "./ui";
import { useSort } from "./useSort";

type Key = "listing" | "status" | "price" | "age" | "views" | "contacts" | "rate" | "shares" | "confirmed";
/** Contacts over views in the range, as a whole percent, at most 100 (the two are counted apart, so a contact can follow a view from before the range); null with no views to divide by. */
const rateOf = (r: ListingRowDto) => (r.views > 0 ? Math.min(100, Math.round((r.contacts / r.views) * 100)) : null);
const value = (r: ListingRowDto, k: Key) => (k === "listing" ? r.label : k === "status" ? statusText(r) : k === "price" ? r.pricePerRoom : k === "age" ? r.ageDays : k === "rate" ? rateOf(r) : k === "confirmed" ? r.confirmedAvailableAt : r[k]);

function statusText(r: ListingRowDto): string {
  if (r.deleted) return "deleted";
  if (r.status !== "open") return r.status;
  if (r.hidden) return "hidden";
  return r.onBoard ? "on board" : "open, off board";
}

const STATUSES = ["all", "on board", "open", "paused", "taken", "hidden", "deleted"] as const;
const STATUS_TONE: Record<string, PillTone> = { "on board": "good", "open, off board": "warn", taken: "info" };
/** The pill's words where the status itself is too long for one. */
const STATUS_SHORT: Record<string, string> = { "open, off board": "Off board" };
const WHICH = [
  { key: "all", label: "All listings" },
  { key: "attention", label: "Needs attention" },
] as const;
const flagsOf = (r: ListingRowDto) => r.flags.map((f) => ({ short: ATTENTION_SHORT[f as AttentionFlag] ?? f, long: ATTENTION[f as AttentionFlag] ?? f }));
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/**
 * Every listing with its numbers in the range: filter, sort, open one in the
 * listing view, or download what's shown as CSV. One line per listing (its
 * address, with its number and poster's name small under it); a card per
 * listing on a phone. Views are people-days; contacts, people who got in
 * touch; rate, contacts over views. The poster shows by name only: an
 * account with none reads "No name", and the email stays in People.
 */
export function ListingsTable({ rows, initialAttention = false }: { rows: ListingRowDto[]; initialAttention?: boolean }) {
  const { openPost, href } = useAdmin();
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("all");
  const [semester, setSemester] = useState("");
  const [audience, setAudience] = useState<"" | "public" | "students">("");
  const [which, setWhich] = useState<(typeof WHICH)[number]["key"]>(initialAttention ? "attention" : "all");

  const semesters = useMemo(() => [...new Map(rows.filter((r) => r.firstSemester).map((r) => [r.firstSemester!, r.semesterLabel])).entries()], [rows]);
  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        const st = statusText(r);
        if (status !== "all" && !(status === "open" ? r.status === "open" && !r.deleted : st === status)) return false;
        if (semester && r.firstSemester !== semester) return false;
        if (audience && (r.deleted || (audience === "students") !== r.studentsOnly)) return false;
        if (which === "attention" && r.flags.length === 0) return false;
        return true;
      }),
    [rows, status, semester, audience, which],
  );
  const { sorted, sort, onSort } = useSort<ListingRowDto, Key>(filtered, value, { key: "views", dir: "desc" });

  const csv = sorted.map((r) => ({
    id: r.id,
    listing: r.label,
    poster: r.ownerName ?? "",
    email: r.ownerEmail ?? "",
    status: statusText(r),
    seen_by: r.deleted ? "" : r.studentsOnly ? "students" : "public",
    price: r.priceText ?? "",
    price_per_room: r.pricePerRoom ?? "",
    rooms: r.rooms ?? "",
    rooms_label: r.roomsLabel ?? "",
    semesters: r.semesterLabel,
    posted: r.postedAt?.slice(0, 10) ?? "",
    age_days: r.ageDays,
    confirmed_available: r.confirmedAvailableAt?.slice(0, 10) ?? "",
    photos: r.photos,
    views: r.views,
    contacts: r.contacts,
    rate_pct: rateOf(r),
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
      className: "md:w-full md:max-w-0",
      cell: (r) => (
        <span className="flex min-w-0 flex-col md:gap-px">
          {r.deleted ? (
            <span className="truncate">Deleted listing</span>
          ) : (
            <button type="button" title={r.label} className={`${LINK} max-w-full self-start text-left`} onClick={() => void openPost(r.id)}>
              <span className="truncate">{r.label}</span>
            </button>
          )}
          <span className="flex min-w-0 items-center gap-1.5 text-xs font-normal text-ink-3 md:overflow-hidden">
            <span className="shrink-0 tabular-nums">#{r.id}</span>
            {!r.deleted && (
              <>
                <span aria-hidden>·</span>
                {r.ownerId ? (
                  <Link href={href(`/admin/people#people:${r.ownerId}`)} className={`truncate underline-offset-2 hover:text-lake hover:underline ${r.ownerName ? "" : "text-ink-3/70"}`}>
                    {r.ownerName ?? "No name"}
                  </Link>
                ) : (
                  <span className="shrink-0 text-ink-3/70">No name</span>
                )}
              </>
            )}
            <Flags flags={flagsOf(r)} oneLine />
          </span>
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      sort: "status",
      // Two pills need the card's whole width on a phone.
      className: "max-md:col-span-2",
      cell: (r) => {
        const st = statusText(r);
        return (
          <span className="inline-flex items-center gap-1">
            <Pill tone={r.deleted ? "outline" : (STATUS_TONE[st] ?? "muted")} title={STATUS_SHORT[st] ? cap(st) : undefined}>
              {STATUS_SHORT[st] ?? cap(st)}
            </Pill>
            {!r.deleted && (
              <Pill tone="outline" title={r.studentsOnly ? "Shown to signed-in students only" : "Shown to anyone, signed in or not"}>
                {r.studentsOnly ? "Students" : "Public"}
              </Pill>
            )}
          </span>
        );
      },
    },
    // One short column, so the Listing column keeps its room: the per-room price (what the board sorts by) and,
    // for several rooms, how many; the full price line and size chip on hover and in the CSV.
    {
      key: "price",
      header: "Per room",
      numeric: true,
      sort: "price",
      cell: (r) =>
        r.pricePerRoom === null ? null : (
          <span className="whitespace-nowrap" title={[r.priceText, r.roomsLabel].filter(Boolean).join(" · ")}>
            {formatMoney(r.pricePerRoom)}
            {r.rooms !== null && r.rooms > 1 && <span className="text-ink-3"> · {r.rooms} rm</span>}
          </span>
        ),
    },
    { key: "semesters", header: "For", wide: true, cell: (r) => (r.semesterShort ? <span title={r.semesterLabel}>{r.semesterShort}</span> : null) },
    { key: "age", header: "Age", numeric: true, sort: "age", cell: (r) => (r.ageDays === null ? null : <span title={r.postedAt ? `Posted ${shortDate(new Date(r.postedAt))}` : undefined}>{shortAge(r.ageDays)}</span>) },
    { key: "views", header: "Views", numeric: true, sort: "views", cell: (r) => <Num n={r.views} /> },
    { key: "contacts", header: "Contacts", numeric: true, sort: "contacts", cell: (r) => <Num n={r.contacts} /> },
    { key: "rate", header: "Rate", numeric: true, sort: "rate", cell: (r) => (rateOf(r) === null ? null : <span title={`${r.contacts} of ${r.views} views`}>{rateOf(r)}%</span>) },
    { key: "shares", header: "Shares", numeric: true, wide: true, sort: "shares", cell: (r) => <Num n={r.shares} /> },
    { key: "photos", header: "Photos", numeric: true, phoneOnly: true, cell: (r) => (r.deleted ? null : <Num n={r.photos} />) },
    { key: "confirmed", header: "Confirmed", numeric: true, wide: true, sort: "confirmed", cell: (r) => (r.confirmedAvailableAt ? shortDate(new Date(r.confirmedAvailableAt)) : null) },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 px-4">
        <SegmentedControl label="Which listings" segments={WHICH} value={which} onPick={setWhich} className="w-full md:w-auto" />
        <div className="grid w-full grid-cols-2 gap-2 md:flex md:w-auto">
          <select aria-label="Status" className={SELECT_SM} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s === "all" ? "Any status" : cap(s)}
              </option>
            ))}
          </select>
          <select aria-label="First semester" className={SELECT_SM} value={semester} onChange={(e) => setSemester(e.target.value)}>
            <option value="">Any semester</option>
            {semesters.map(([code, label]) => (
              <option key={code} value={code}>
                {label.split(" & ")[0] || code}
              </option>
            ))}
          </select>
          <select aria-label="Seen by" className={SELECT_SM} value={audience} onChange={(e) => setAudience(e.target.value as typeof audience)}>
            <option value="">Any audience</option>
            <option value="public">Public</option>
            <option value="students">Students only</option>
          </select>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className={`${MUTED} tabular-nums`}>
            {sorted.length} of {rows.length}
          </span>
          <CsvButton name="listings" columns={Object.keys(csv[0] ?? { id: 0 }).map((k) => ({ key: k, label: k }))} rows={csv} />
        </div>
      </div>
      <DataTable label="Listings" oneLine columns={columns} rows={sorted} rowKey={(r) => r.id} sort={sort} onSort={onSort} rowProps={(r) => (r.deleted ? { className: "text-ink-3" } : {})} empty="No listings match." />
    </div>
  );
}
