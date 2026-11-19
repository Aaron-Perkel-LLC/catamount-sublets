"use client";

import { ChevronLeft, ChevronRight, Star, X } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { shortDate } from "@/lib/dates";
import { formatBytes } from "@/lib/format";
import { adminBulkDeletePhotos, adminDeleteOrphans, adminLoadInventory, adminLoadOrphans, adminPhotoOp } from "@/server/actions/admin";
import type { InventoryListing, OrphanReport } from "@/server/services/admin";
import { Card, Empty } from "./Card";
import { DataTable } from "./DataTable";
import { KpiRow } from "./KpiCard";
import { Pill, type PillTone } from "./Pill";
import { SegmentedControl } from "./SegmentedControl";
import type { SemesterRowDto } from "./types";
import { BTN_DANGER, CARD_TITLE, FIELD, FIELD_LABEL, ICON_BTN, ICON_BTN_DANGER, LINK, MUTED, num, NUM, SELECT } from "./ui";

export interface StorageUsage {
  files: number;
  bytes: number;
  writesThisMonth: number;
  caps: { bytes: number; writes: number; transferBytes: number };
}

/** One allowance as a thin bar: what is used against its cap, maple from 80%. */
function Meter({ label, used, cap, n, of }: { label: string; used: string; cap: string; n: number; of: number }) {
  const pct = Math.min(100, Math.round((n / of) * 100));
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3 text-[13px]">
        <span className="text-ink-2">{label}</span>
        <span className="shrink-0 tabular-nums">
          <span className={NUM}>{used}</span> <span className="text-xs text-ink-3">/ {cap}</span>
        </span>
      </div>
      <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-valuetext={`${used} of ${cap}`} className="h-1 rounded-full bg-line-light">
        <div className={`h-full rounded-full ${pct >= 80 ? "bg-maple" : "bg-chart-lake"}`} style={{ width: `${pct}%`, minWidth: n > 0 ? 3 : 0 }} />
      </div>
    </div>
  );
}

/** The Blob allowances that matter on the Hobby plan, from the database's own numbers; transfer is only on Vercel's usage page. */
export function StorageReadout({ s }: { s: StorageUsage }) {
  return (
    <Card
      title="Photo storage"
      tip={`Blob's allowances on the Hobby plan, from the database's own numbers. Writes are photos added since the 1st, times 4. Transfer (${formatBytes(s.caps.transferBytes)} a month) is only on Vercel's usage page. Over any cap, photos stop loading for 30 days.`}
      actions={<span className={`${MUTED} tabular-nums`}>{num(s.files)} files</span>}
    >
      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <Meter label="Stored" used={formatBytes(s.bytes)} cap={formatBytes(s.caps.bytes)} n={s.bytes} of={s.caps.bytes} />
        <Meter label="Writes this month" used={`~${num(s.writesThisMonth)}`} cap={num(s.caps.writes)} n={s.writesThisMonth} of={s.caps.writes} />
      </div>
    </Card>
  );
}

const VIEWS = [
  { key: "photos", label: "Photos" },
  { key: "orphans", label: "Orphans & missing" },
] as const;
const STATUS_TONE: Record<string, PillTone> = { open: "good", taken: "info" };
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
/** A photo's control: a square icon button, 44 px on a phone and 24 px under a thumbnail with a pointer (ui.ts has no icon button). */
const plural = (n: number, one: string) => `${num(n)} ${n === 1 ? one : `${one}s`}`;

/**
 * Every photo on the site, by listing; a bulk delete that never takes a
 * listing's last photo; and the orphan sweep. On a phone a photo is a row
 * (thumbnail, then its controls at 44 px); with a pointer, a grid of thumbnails.
 */
export function ImagesTab({ focusListingId, semesters, storage }: { focusListingId: number | null; semesters: SemesterRowDto[]; storage: StorageUsage }) {
  const [inventory, setInventory] = useState<InventoryListing[] | null>(null);
  const [orphans, setOrphans] = useState<OrphanReport | null>(null);
  const [view, setView] = useState<"photos" | "orphans">("photos");
  const [semester, setSemester] = useState("");
  const [offBoard, setOffBoard] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirmCount, setConfirmCount] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    adminLoadInventory().then(setInventory);
  }, []);

  const reload = async () => setInventory(await adminLoadInventory());
  const shown = (inventory ?? []).filter((l) => (!focusListingId || l.id === focusListingId) && (!semester || l.semesterCodes.includes(semester)) && (!offBoard || l.hidden || l.status !== "open"));
  const totalBytes = (inventory ?? []).reduce((t, l) => t + l.bytes, 0);

  const op = (photoId: number, kind: "move" | "cover" | "delete", dir: -1 | 1 = 1) =>
    start(async () => {
      const r = await adminPhotoOp(photoId, kind === "move" ? { kind, dir } : { kind });
      setNote(r.ok ? "Saved." : r.error);
      await reload();
    });

  return (
    <div className="flex flex-col gap-4">
      <StorageReadout s={storage} />

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <SegmentedControl
          label="Show"
          className="max-md:w-full"
          segments={VIEWS}
          value={view}
          onPick={(key) =>
            key === "photos"
              ? setView("photos")
              : start(async () => {
                  setView("orphans");
                  setOrphans(await adminLoadOrphans());
                })
          }
        />
        <span className={`${MUTED} tabular-nums`}>{inventory ? `${plural(inventory.reduce((t, l) => t + l.photos.length, 0), "photo")} · ${formatBytes(totalBytes)}` : "Loading…"}</span>
      </div>

      {view === "photos" && (
        <Card flush>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4">
            <select aria-label="Semester" className={`${SELECT} md:w-44`} value={semester} onChange={(e) => setSemester(e.target.value)}>
              <option value="">All semesters</option>
              {semesters.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </select>
            <label className="flex min-h-11 items-center gap-2 text-[13px] text-ink-2 md:min-h-0">
              <input type="checkbox" className="h-4 w-4" checked={offBoard} onChange={(e) => setOffBoard(e.target.checked)} /> Off the board only
            </label>
            {focusListingId && (
              <a href="#images" className={LINK}>
                Show all listings
              </a>
            )}
            {selected.size > 0 && (
              <button
                type="button"
                className={`${BTN_DANGER} md:ml-auto`}
                disabled={pending}
                onClick={() => {
                  if (!confirm(`Delete ${selected.size} photo(s)? A listing always keeps its cover.`)) return;
                  start(async () => {
                    const r = await adminBulkDeletePhotos([...selected]);
                    setNote(r.ok ? `Deleted ${r.data.deleted}${r.data.kept ? `; kept the cover on ${r.data.kept} listing(s)` : ""}.` : r.error);
                    setSelected(new Set());
                    await reload();
                  });
                }}
              >
                Delete {selected.size} selected
              </button>
            )}
          </div>
          {note && <p className="px-4 text-[13px] text-ink-2">{note}</p>}
          {shown.length > 0 && (
            <ul>
              {shown.map((l) => (
                <li key={l.id} className="flex flex-col gap-3 border-t border-line-light px-4 py-3 last:pb-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <h2 className={CARD_TITLE}>
                      <a href={`/browse?id=${l.id}`} className={LINK}>
                        {l.address}
                      </a>
                    </h2>
                    <span className="flex items-center gap-1">
                      <Pill tone={STATUS_TONE[l.status] ?? "muted"}>{cap(l.status)}</Pill>
                      {l.hidden && <Pill>Hidden</Pill>}
                    </span>
                    <span className={MUTED}>
                      <span title={l.ownerEmail}>{l.ownerName ?? l.ownerEmail}</span> · {l.semesterLabel}
                    </span>
                    <span className={`${MUTED} tabular-nums md:ml-auto`}>
                      {plural(l.photos.length, "photo")} · {formatBytes(l.bytes)}
                    </span>
                  </div>
                  <ul className="grid gap-3 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8">
                    {l.photos.map((p, i) => (
                      <li key={p.id} className="flex min-w-0 gap-3 md:flex-col md:gap-1.5">
                        <div className="relative aspect-square w-24 shrink-0 overflow-hidden rounded-lg bg-line-light md:w-full">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={p.thumbUrl || p.displayUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                          <label className="absolute top-0 left-0 grid h-11 w-11 place-items-center md:h-7 md:w-7">
                            <input
                              type="checkbox"
                              aria-label="Select photo"
                              className="h-4 w-4"
                              checked={selected.has(p.id)}
                              onChange={(e) => {
                                const next = new Set(selected);
                                if (e.target.checked) next.add(p.id);
                                else next.delete(p.id);
                                setSelected(next);
                              }}
                            />
                          </label>
                          {i === 0 && (
                            <span className="absolute bottom-1 left-1 flex">
                              <Pill>Cover</Pill>
                            </span>
                          )}
                        </div>
                        <div className="flex min-w-0 flex-col justify-between gap-1 md:gap-1.5">
                          <span className="text-xs whitespace-nowrap text-ink-3 tabular-nums">
                            {p.width}×{p.height} · {formatBytes(p.bytes ?? 0)}
                          </span>
                          <div className="flex gap-1 md:gap-0.5">
                            <button type="button" className={ICON_BTN} aria-label="Move earlier" disabled={pending || i === 0} onClick={() => op(p.id, "move", -1)}>
                              <ChevronLeft className="h-4 w-4 md:h-3 md:w-3" aria-hidden />
                            </button>
                            <button type="button" className={ICON_BTN} aria-label="Make cover" disabled={pending || i === 0} onClick={() => op(p.id, "cover")}>
                              <Star className="h-4 w-4 md:h-3 md:w-3" aria-hidden />
                            </button>
                            <button type="button" className={ICON_BTN} aria-label="Move later" disabled={pending || i === l.photos.length - 1} onClick={() => op(p.id, "move", 1)}>
                              <ChevronRight className="h-4 w-4 md:h-3 md:w-3" aria-hidden />
                            </button>
                            <button type="button" className={ICON_BTN_DANGER} aria-label="Delete" disabled={pending || l.photos.length === 1} onClick={() => confirm("Delete this photo?") && op(p.id, "delete")}>
                              <X className="h-4 w-4 md:h-3 md:w-3" aria-hidden />
                            </button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
          {inventory && shown.length === 0 && (
            <div className="px-4">
              <Empty>Nothing to show.</Empty>
            </div>
          )}
        </Card>
      )}

      {view === "orphans" &&
        (!orphans ? (
          <Card>
            <Empty>Sweeping storage…</Empty>
          </Card>
        ) : (
          <>
            <KpiRow
              kpis={[
                { key: "referenced", label: "Files in use", value: num(orphans.referenced), tip: "Files in the media store that a photo row names." },
                { key: "orphans", label: "Orphan files", value: num(orphans.media.length), tip: "Files in the media store that belong to no photo row." },
                { key: "raw", label: "Raw uploads waiting", value: num(orphans.rawUploads.length), tip: "Raw uploads older than a day, waiting for the nightly sweep." },
                { key: "missing", label: "Missing files", value: num(orphans.missing.length), tip: "Photo rows that point at files that are gone." },
              ]}
            />
            {note && <p className="text-[13px] text-ink-2">{note}</p>}
            {orphans.media.length > 0 && (
              <Card flush title="Orphan files">
                <div className="max-h-80 overflow-y-auto">
                  <DataTable
                    label="Orphan files"
                    rows={orphans.media}
                    rowKey={(m) => m.url}
                    columns={[
                      { key: "file", header: "File", primary: true, cell: (m) => <span className="break-all">{m.pathname}</span> },
                      { key: "size", header: "Size", numeric: true, cell: (m) => formatBytes(m.size) },
                      { key: "uploaded", header: "Uploaded", numeric: true, cell: (m) => shortDate(new Date(m.uploadedAt)) },
                    ]}
                  />
                </div>
                <div className="flex flex-wrap items-end gap-2 px-4">
                  <label className={`${FIELD_LABEL} w-full md:w-40`}>
                    Type {orphans.media.length} to confirm
                    <input className={FIELD} placeholder={String(orphans.media.length)} value={confirmCount} onChange={(e) => setConfirmCount(e.target.value)} />
                  </label>
                  <button
                    type="button"
                    className={`${BTN_DANGER} md:mb-0.5`}
                    disabled={pending || Number(confirmCount) !== orphans.media.length}
                    onClick={() =>
                      start(async () => {
                        const r = await adminDeleteOrphans(
                          orphans.media.map((m) => m.url),
                          Number(confirmCount),
                        );
                        setNote(r.ok ? `Deleted ${r.data.deleted} orphan file(s).` : r.error);
                        setConfirmCount("");
                        setOrphans(await adminLoadOrphans());
                      })
                    }
                  >
                    Delete orphans
                  </button>
                </div>
              </Card>
            )}
            {orphans.missing.length > 0 && (
              <Card flush title="Missing files" tip="Photo rows that point at files that are gone.">
                <DataTable
                  label="Missing files"
                  rows={orphans.missing}
                  rowKey={(m) => `${m.photoId}:${m.url}`}
                  columns={[
                    { key: "listing", header: "Listing", primary: true, cell: (m) => <span className="font-bold tabular-nums">#{m.listingId}</span> },
                    { key: "photo", header: "Photo", numeric: true, cell: (m) => `#${m.photoId}` },
                    { key: "url", header: "File", cell: (m) => <span className="break-all text-ink-3">{m.url}</span> },
                  ]}
                />
              </Card>
            )}
          </>
        ))}
    </div>
  );
}
