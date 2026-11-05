"use client";

import { ChevronLeft, ChevronRight, Star, X } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { formatBytes } from "@/lib/format";
import { adminBulkDeletePhotos, adminDeleteOrphans, adminLoadInventory, adminLoadOrphans, adminPhotoOp } from "@/server/actions/admin";
import type { InventoryListing, OrphanReport } from "@/server/services/admin";
import type { SemesterRowDto } from "./AdminTabs";

export interface StorageUsage {
  files: number;
  bytes: number;
  writesThisMonth: number;
  caps: { bytes: number; writes: number; transferBytes: number };
}

/** The Blob allowances that matter on the Hobby plan, from the database's own numbers; transfer is only on Vercel's usage page. */
function StorageReadout({ s }: { s: StorageUsage }) {
  const pct = (n: number, cap: number) => Math.min(100, Math.round((n / cap) * 100));
  const bar = (n: number, cap: number) => (
    <span className="inline-block h-2 w-24 overflow-hidden rounded-full bg-line align-middle">
      <span className={`block h-full ${pct(n, cap) >= 80 ? "bg-maple" : "bg-lake"}`} style={{ width: `${pct(n, cap)}%` }} />
    </span>
  );
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink-2">
      <span className="font-bold text-ink">Blob (Hobby)</span>
      <span>
        {formatBytes(s.bytes)} of {formatBytes(s.caps.bytes)} stored {bar(s.bytes, s.caps.bytes)}
      </span>
      <span>
        ~{s.writesThisMonth} of {s.caps.writes} writes this month {bar(s.writesThisMonth, s.caps.writes)}
      </span>
      <span className="text-ink-3">
        {s.files} files. Writes = photos added since the 1st, times 4. Transfer ({formatBytes(s.caps.transferBytes)} a month) is only on Vercel&apos;s usage page. Over any cap, photos stop loading for 30 days.
      </span>
    </div>
  );
}

/** Every photo on the site, by listing; a bulk delete that never takes a listing's last photo; and the orphan sweep. */
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
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <button type="button" className={`link ${view === "photos" ? "underline" : ""}`} onClick={() => setView("photos")}>
          Photos
        </button>
        <button
          type="button"
          className={`link ${view === "orphans" ? "underline" : ""}`}
          onClick={() =>
            start(async () => {
              setView("orphans");
              setOrphans(await adminLoadOrphans());
            })
          }
        >
          Orphans &amp; missing
        </button>
        <span className="text-ink-3">
          {inventory ? `${inventory.reduce((t, l) => t + l.photos.length, 0)} photos, ${formatBytes(totalBytes)}` : "Loading…"}
        </span>
      </div>

      {view === "photos" && (
        <>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <select className="field w-44 py-1" value={semester} onChange={(e) => setSemester(e.target.value)}>
              <option value="">All semesters</option>
              {semesters.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="h-4 w-4" checked={offBoard} onChange={(e) => setOffBoard(e.target.checked)} /> Off the board only
            </label>
            {focusListingId && (
              <a href="#images" className="link">
                Show all listings
              </a>
            )}
            {selected.size > 0 && (
              <button
                type="button"
                className="btn-secondary px-2 py-1 text-xs text-error-ink"
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
          {note && <p className="text-sm text-ink-2">{note}</p>}
          {shown.map((l) => (
            <section key={l.id} className="flex flex-col gap-2 rounded-xl border border-line bg-paper p-3">
              <div className="flex flex-wrap items-baseline gap-2 text-sm">
                <a href={`/browse?id=${l.id}`} className="font-bold text-lake">
                  {l.address}
                </a>
                <span className="text-ink-3">
                  <span title={l.ownerEmail}>{l.ownerName ?? l.ownerEmail}</span> · {l.semesterLabel} · {l.status}
                  {l.hidden ? " · hidden" : ""} · {l.photos.length} photos · {formatBytes(l.bytes)}
                </span>
              </div>
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-8">
                {l.photos.map((p, i) => (
                  <li key={p.id} className="flex flex-col gap-1">
                    <div className="relative aspect-square overflow-hidden rounded-lg border border-line bg-line-light">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.thumbUrl || p.displayUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                      <input
                        type="checkbox"
                        aria-label="Select photo"
                        className="absolute left-1 top-1 h-4 w-4"
                        checked={selected.has(p.id)}
                        onChange={(e) => {
                          const next = new Set(selected);
                          if (e.target.checked) next.add(p.id);
                          else next.delete(p.id);
                          setSelected(next);
                        }}
                      />
                      {i === 0 && <span className="absolute bottom-1 left-1 rounded bg-maple px-1 text-[10px] font-bold text-paper">Cover</span>}
                    </div>
                    <div className="text-[10px] text-ink-3">
                      {p.width}×{p.height} · {formatBytes(p.bytes ?? 0)}
                    </div>
                    <div className="flex justify-center gap-0.5">
                      <button type="button" className="icon-btn p-1" aria-label="Move earlier" disabled={pending || i === 0} onClick={() => op(p.id, "move", -1)}>
                        <ChevronLeft className="h-3 w-3" />
                      </button>
                      <button type="button" className="icon-btn p-1" aria-label="Make cover" disabled={pending || i === 0} onClick={() => op(p.id, "cover")}>
                        <Star className="h-3 w-3" />
                      </button>
                      <button type="button" className="icon-btn p-1" aria-label="Move later" disabled={pending || i === l.photos.length - 1} onClick={() => op(p.id, "move", 1)}>
                        <ChevronRight className="h-3 w-3" />
                      </button>
                      <button type="button" className="icon-btn p-1 text-error-ink" aria-label="Delete" disabled={pending || l.photos.length === 1} onClick={() => confirm("Delete this photo?") && op(p.id, "delete")}>
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {inventory && shown.length === 0 && <p className="text-sm text-ink-3">Nothing to show.</p>}
        </>
      )}

      {view === "orphans" && (
        <div className="flex flex-col gap-3 text-sm">
          {!orphans ? (
            <p className="text-ink-3">Sweeping storage…</p>
          ) : (
            <>
              <p className="text-ink-2">
                {orphans.referenced} files are named by photo rows. {orphans.media.length} file{orphans.media.length === 1 ? "" : "s"} in the media store belong to no row;{" "}
                {orphans.rawUploads.length} raw upload{orphans.rawUploads.length === 1 ? "" : "s"} older than a day are waiting for the nightly sweep.
              </p>
              {orphans.media.length > 0 && (
                <>
                  <ul className="max-h-64 overflow-y-auto rounded-lg border border-line bg-paper p-2 text-xs">
                    {orphans.media.map((m) => (
                      <li key={m.url}>
                        {m.pathname} · {formatBytes(m.size)} · {m.uploadedAt.toString().slice(0, 10)}
                      </li>
                    ))}
                  </ul>
                  <div className="flex items-center gap-2">
                    <input className="field w-24" placeholder={String(orphans.media.length)} value={confirmCount} onChange={(e) => setConfirmCount(e.target.value)} />
                    <button
                      type="button"
                      className="btn-secondary text-error-ink"
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
                </>
              )}
              {orphans.missing.length > 0 && (
                <p className="text-error-ink">
                  {orphans.missing.length} photo row{orphans.missing.length === 1 ? "" : "s"} point at files that are gone: {orphans.missing.map((m) => `listing ${m.listingId} photo ${m.photoId}`).join(", ")}.
                </p>
              )}
              {note && <p className="text-ink-2">{note}</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
