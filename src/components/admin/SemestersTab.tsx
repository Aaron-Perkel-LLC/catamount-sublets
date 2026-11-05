"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { shortDate } from "@/lib/dates";
import { formatBytes, formatMoney } from "@/lib/format";
import { suggestedCode } from "@/lib/semesters";
import { adminAddSemester, adminArchiveCommit, adminArchivePreview, adminDeleteSemester, adminToggleSemester } from "@/server/actions/admin";
import type { ArchivePlan } from "@/server/services/admin";
import type { ArchiveRowDto, SemesterRowDto } from "./AdminTabs";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Semesters in two groups, what is on the board and what is hidden, each
 * with the one action it usually needs. Adding is behind a button, the
 * archive preview is a dialog, and past archives stay folded.
 */
export function SemestersTab({ semesters, archives }: { semesters: SemesterRowDto[]; archives: ArchiveRowDto[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [plan, setPlan] = useState<ArchivePlan | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(r.error ?? "That didn't work.");
      else router.refresh();
    });

  const live = semesters.filter((s) => !s.archivedAt);
  const row = (s: SemesterRowDto) => (
    <li key={s.code} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line-light py-2.5 first:border-t-0">
      <span className="font-bold" title={`Code: ${s.code}`}>
        {s.name}
      </span>
      <span className="text-sm text-ink-3">{plural(s.postCount, "listing")}</span>
      <span className="ml-auto flex flex-wrap gap-1">
        {!s.active && (
          <button type="button" className="btn-secondary px-2 py-1 text-xs" disabled={pending} onClick={() => start(async () => setPlan(await adminArchivePreview(s.code)))}>
            Archive…
          </button>
        )}
        {s.postCount === 0 && (
          <button type="button" className="btn-secondary px-2 py-1 text-xs text-error-ink" disabled={pending} onClick={() => confirm(`Delete ${s.name}?`) && run(() => adminDeleteSemester(s.code))}>
            Delete
          </button>
        )}
        <button
          type="button"
          className="btn-secondary px-2 py-1 text-xs"
          disabled={pending}
          onClick={() => {
            if (s.active && s.postCount > 0 && !confirm(`Hide ${s.name}? ${plural(s.postCount, "listing")} that run only for it leave Browse and Map. Nothing is deleted; showing it again brings them back.`)) return;
            run(() => adminToggleSemester(s.code));
          }}
        >
          {s.active ? "Hide" : "Show"}
        </button>
      </span>
    </li>
  );

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <AddSemester pending={pending} run={run} />
      {error && (
        <p role="alert" className="text-sm text-error-ink">
          {error}
        </p>
      )}
      {result && (
        <p role="status" className="text-sm text-ink-2">
          {result}
        </p>
      )}

      <Group title="On the board" hint="Students can post for these, and their listings show.">
        {live.filter((s) => s.active).map(row)}
      </Group>
      <Group title="Hidden" hint="Listings that run only for these are off the board. Archive one when it is over.">
        {live.filter((s) => !s.active).map(row)}
      </Group>

      {archives.length > 0 && (
        <details className="rounded-xl border border-line bg-paper p-4 [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between font-bold">
            Archived <span className="text-sm font-normal text-ink-3">{plural(archives.length, "semester")}</span>
          </summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-ink-3">
                <tr>
                  <th className="py-1 pr-3 font-normal">Semester</th>
                  <th className="pr-3 font-normal">Archived</th>
                  <th className="pr-3 font-normal">Listings</th>
                  <th className="pr-3 font-normal">Taken</th>
                  <th className="pr-3 font-normal">Median</th>
                  <th className="font-normal">Viewed</th>
                </tr>
              </thead>
              <tbody>
                {archives.map((a) => (
                  <tr key={a.semesterCode} className="border-t border-line-light" title={`${a.contacts} got in touch · ${a.shares} share taps · ${a.photos} photos (${formatBytes(a.bytes)})`}>
                    <td className="py-1.5 pr-3 font-bold whitespace-nowrap">{a.semesterName}</td>
                    <td className="pr-3 whitespace-nowrap">{shortDate(new Date(a.archivedAt))}</td>
                    <td className="pr-3">{a.listings}</td>
                    <td className="pr-3">{a.taken}</td>
                    <td className="pr-3">{a.priceMedian === null ? "—" : formatMoney(a.priceMedian)}</td>
                    <td>{a.views}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      <ArchiveDialog
        plan={plan}
        onClose={() => setPlan(null)}
        onArchived={(text) => {
          setPlan(null);
          setResult(text);
          router.refresh();
        }}
      />
    </div>
  );
}

function Group({ title, hint, children }: { title: string; hint: string; children: React.ReactNode[] }) {
  return (
    <section className="rounded-xl border border-line bg-paper p-4">
      <h3 className="font-bold">{title}</h3>
      <p className="text-sm text-ink-3">{hint}</p>
      {children.length > 0 ? <ul className="mt-2">{children}</ul> : <p className="mt-2 text-sm text-ink-3">None.</p>}
    </section>
  );
}

/** One name; the code fills itself in from it ("Fall 2028" → fall28) until it is edited. */
function AddSemester({ pending, run }: { pending: boolean; run: (fn: () => Promise<{ ok: boolean; error?: string }>) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [typedCode, setTypedCode] = useState<string | null>(null);
  const code = typedCode ?? suggestedCode(name);

  if (!open)
    return (
      <button type="button" className="btn-secondary self-start py-2" onClick={() => setOpen(true)}>
        Add semester
      </button>
    );
  return (
    <form
      className="flex flex-wrap items-end gap-2 rounded-xl border border-line bg-paper p-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          const r = await adminAddSemester({ code, name });
          if (r.ok) {
            setName("");
            setTypedCode(null);
            setOpen(false);
          }
          return r;
        });
      }}
    >
      <label className="flex flex-col gap-1 text-sm">
        Name
        <input className="field w-48" value={name} onChange={(e) => setName(e.target.value)} placeholder="Fall 2028" autoFocus />
      </label>
      <label className="flex flex-col gap-1 text-xs text-ink-3">
        Code
        <input className="field w-28 py-2 text-sm" value={code} onChange={(e) => setTypedCode(e.target.value)} placeholder="fall28" />
      </label>
      <button type="submit" className="btn-primary py-2" disabled={pending || !name.trim() || !code}>
        Add
      </button>
      <button type="button" className="link text-sm" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </form>
  );
}

/** The archive's dry run as a dialog: what goes, what stays, and the code typed back to confirm. */
function ArchiveDialog({ plan, onClose, onArchived }: { plan: ArchivePlan | null; onClose: () => void; onArchived: (result: string) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [pending, start] = useTransition();
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (plan && d && !d.open) d.showModal();
    if (!plan && d?.open) d.close();
  }, [plan]);

  const t = plan?.totals;
  return (
    <dialog
      ref={ref}
      onClose={() => {
        setTyped("");
        setError(null);
        onClose();
      }}
      className="m-auto w-[min(36rem,calc(100vw-2rem))] rounded-xl border border-line bg-paper p-0 text-ink backdrop:bg-ink/60"
    >
      {plan && t && (
        <div className="flex max-h-[85dvh] flex-col gap-3 overflow-y-auto p-5">
          <h2 className="text-lg font-bold">Archive {plan.name}</h2>
          {plan.blocking.length > 0 ? (
            <ul className="text-sm text-error-ink">
              {plan.blocking.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          ) : (
            <>
              {t.listings === 0 ? (
                <p className="text-sm text-ink-2">No listing runs only for it, so nothing is removed; it moves to Archived.</p>
              ) : (
                <p className="text-sm text-ink-2">
                  Removes {plural(t.listings, "listing")} for good ({t.taken} taken) with {plural(t.photos, "photo")} ({formatBytes(t.bytes)}). A totals row is kept: median{" "}
                  {t.priceMedian === null ? "—" : formatMoney(t.priceMedian)}, {t.views} viewed, {t.contacts} got in touch.
                </p>
              )}
              {plan.going.length > 0 && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-lake">The {plural(plan.going.length, "listing")} going</summary>
                  <ul className="mt-1 flex flex-col gap-0.5 text-ink-2">
                    {plan.going.map((g) => (
                      <li key={g.id} title={g.ownerEmail}>
                        {g.ownerName ?? g.ownerEmail} · {g.address.split(",")[0]} · {formatMoney(g.price)}
                        {g.status !== "open" ? ` · ${g.status}` : ""}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {plan.staying.length > 0 && (
                <p className="text-sm text-ink-2">
                  Staying, because they run on into a later semester: {plan.staying.map((s) => `${s.ownerName ?? s.ownerEmail} → ${s.nextSemester}`).join("; ")}.
                </p>
              )}
              <label className="flex flex-col gap-1 text-sm">
                Type {plan.code} to confirm
                <input className="field w-40" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
              </label>
              {error && (
                <p role="alert" className="text-sm text-error-ink">
                  {error}
                </p>
              )}
            </>
          )}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {plan.blocking.length === 0 && (
              <button
                type="button"
                className="rounded-lg bg-error-ink px-4 py-2.5 font-bold text-paper disabled:opacity-50"
                disabled={pending || typed !== plan.code}
                onClick={() =>
                  start(async () => {
                    const r = await adminArchiveCommit(plan.code, typed);
                    if (!r.ok) return setError(r.error);
                    setTyped("");
                    onArchived(`Archived ${plan.name}: ${plural(r.data.listings, "listing")} removed, ${plural(r.data.filesDeleted, "file")} deleted.`);
                  })
                }
              >
                Archive for good
              </button>
            )}
            <button type="button" className="btn-secondary" onClick={() => ref.current?.close()}>
              {plan.blocking.length > 0 ? "Close" : "Cancel"}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
