"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { shortDate } from "@/lib/dates";
import { formatBytes, formatMoney } from "@/lib/format";
import { suggestedCode } from "@/lib/semesters";
import { adminAddSemester, adminArchiveCommit, adminArchivePreview, adminDeleteSemester, adminOutcomeAskPreview, adminSendOutcomeAsks, adminSendOutcomeAskTest, adminToggleSemester } from "@/server/actions/admin";
import type { ArchivePlan } from "@/server/services/admin";
import type { AskPreview } from "@/server/services/listing-outcome";
import { Card, Empty } from "./Card";
import { type Column, DataTable, Num } from "./DataTable";
import { Pill } from "./Pill";
import type { ArchiveRowDto, SemesterRowDto } from "./types";
import { BTN, BTN_DANGER, BTN_PRIMARY, CARD_TITLE, DIALOG, FIELD, FIELD_LABEL, MUTED, SELECT } from "./ui";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** A fold inside a dialog ("The 3 listings going"): a link-weight line, 44 px to tap on a phone. */
const FOLD = "cursor-pointer py-3 text-[13px] leading-5 font-bold text-lake md:py-0";
/** Rows carry 32 px buttons, so the other cells sit on their middle. */
const MID = "md:align-middle";

/**
 * Semesters as one table, what is on the board first and then what is
 * hidden, each row with the actions it can take; adding is behind the
 * card's button. Beside it, the "still available?" email for one semester.
 * Below, the totals row each archived semester left. The archive and the
 * email are both a preview in a dialog, with the code typed back.
 */
export function SemestersTab({ semesters, archives }: { semesters: SemesterRowDto[]; archives: ArchiveRowDto[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [plan, setPlan] = useState<ArchivePlan | null>(null);
  const [ask, setAsk] = useState<AskPreview | null>(null);
  const [adding, setAdding] = useState(false);
  const [askCode, setAskCode] = useState("");

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(r.error ?? "That didn't work.");
      else router.refresh();
    });

  const live = semesters.filter((s) => !s.archivedAt);
  const rows = [...live.filter((s) => s.active), ...live.filter((s) => !s.active)];
  // Who can be asked: any semester with listings. A hidden one is the usual
  // target (it is over, and about to be archived), so it is offered first.
  const askable = live.filter((s) => s.postCount > 0);
  const asking = askable.find((s) => s.code === askCode) ?? askable.find((s) => !s.active) ?? askable[0];

  const columns: Column<SemesterRowDto>[] = [
    {
      key: "name",
      header: "Semester",
      primary: true,
      className: MID,
      cell: (s) => (
        <span className="font-bold" title={`Code: ${s.code}`}>
          {s.name}
        </span>
      ),
    },
    { key: "status", header: "Status", className: MID, cell: (s) => (s.active ? <Pill tone="good">On the board</Pill> : <Pill>Hidden</Pill>) },
    { key: "listings", header: "Listings", numeric: true, className: MID, cell: (s) => <Num n={s.postCount} /> },
    {
      key: "actions",
      header: "Actions",
      srHeader: true,
      bare: true,
      cell: (s) => (
        <span className="flex flex-wrap gap-2 md:justify-end">
          {!s.active && (
            <button type="button" className={BTN} disabled={pending} onClick={() => start(async () => setPlan(await adminArchivePreview(s.code)))}>
              Archive…
            </button>
          )}
          {s.postCount === 0 && (
            <button type="button" className={BTN_DANGER} disabled={pending} onClick={() => confirm(`Delete ${s.name}?`) && run(() => adminDeleteSemester(s.code))}>
              Delete
            </button>
          )}
          <button
            type="button"
            className={BTN}
            disabled={pending}
            onClick={() => {
              if (s.active && s.postCount > 0 && !confirm(`Hide ${s.name}? ${plural(s.postCount, "listing")} that run only for it leave Browse and Map. Nothing is deleted; showing it again brings them back.`)) return;
              run(() => adminToggleSemester(s.code));
            }}
          >
            {s.active ? "Hide" : "Show"}
          </button>
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card
          flush
          title="Semesters"
          tip="Students can post for a semester that is on the board, and its listings show. Listings that run only for hidden semesters are off the board. Archive a hidden one when it is over."
          actions={
            !adding && (
              <button type="button" className={BTN} onClick={() => setAdding(true)}>
                Add semester
              </button>
            )
          }
        >
          {adding && (
            <div className="px-4">
              <AddSemester pending={pending} run={run} onClose={() => setAdding(false)} />
            </div>
          )}
          {error && (
            <p role="alert" className="px-4 text-[13px] text-error-ink">
              {error}
            </p>
          )}
          {result && (
            <p role="status" className="px-4 text-[13px] text-ink-2">
              {result}
            </p>
          )}
          <DataTable label="Semesters" columns={columns} rows={rows} rowKey={(s) => s.code} empty="No semesters yet." />
        </Card>

        <Card
          title="Ask posters"
          tip="Emails “Is your sublet still available?” with four one-tap answers to one semester's posters: the listings archiving would remove, less anyone already asked or answered, banned, or marked Stop email."
        >
          {asking ? (
            <>
              <label className={FIELD_LABEL}>
                Semester
                <select className={SELECT} value={asking.code} onChange={(e) => setAskCode(e.target.value)}>
                  {askable.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.name} ({plural(s.postCount, "listing")})
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className={`${BTN} self-start`} disabled={pending} onClick={() => start(async () => setAsk(await adminOutcomeAskPreview(asking.code)))}>
                Ask posters…
              </button>
              <p className={MUTED}>Shows who it would go to first. Nothing is sent until you confirm there.</p>
            </>
          ) : (
            <Empty>No semester has listings to ask about.</Empty>
          )}
        </Card>
      </div>

      {archives.length > 0 && (
        <Card flush title="Archived" tip="The totals kept when a semester was archived; its listings and their photos were removed for good. Median is the median price.">
          <DataTable
            label="Archived semesters"
            rows={archives}
            rowKey={(a) => a.semesterCode}
            columns={[
              { key: "name", header: "Semester", primary: true, cell: (a) => <span className="font-bold whitespace-nowrap">{a.semesterName}</span> },
              { key: "archived", header: "Archived", cell: (a) => <span className="whitespace-nowrap tabular-nums">{shortDate(new Date(a.archivedAt))}</span> },
              { key: "listings", header: "Listings", numeric: true, cell: (a) => <Num n={a.listings} /> },
              { key: "taken", header: "Taken", numeric: true, cell: (a) => <Num n={a.taken} /> },
              { key: "median", header: "Median", numeric: true, cell: (a) => (a.priceMedian === null ? "—" : formatMoney(a.priceMedian)) },
              { key: "views", header: "Viewed", numeric: true, cell: (a) => <Num n={a.views} /> },
              { key: "contacts", header: "Got in touch", numeric: true, cell: (a) => <Num n={a.contacts} /> },
              { key: "shares", header: "Share taps", numeric: true, wide: true, cell: (a) => <Num n={a.shares} /> },
              { key: "photos", header: "Photos", numeric: true, wide: true, cell: (a) => <Num n={a.photos} /> },
              { key: "bytes", header: "Size", numeric: true, wide: true, cell: (a) => formatBytes(a.bytes) },
            ]}
          />
        </Card>
      )}

      <AskDialog
        preview={ask}
        onClose={() => setAsk(null)}
        onSent={(text) => {
          setAsk(null);
          setResult(text);
          router.refresh();
        }}
      />

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

/** One name; the code fills itself in from it ("Fall 2028" → fall28) until it is edited. */
function AddSemester({ pending, run, onClose }: { pending: boolean; run: (fn: () => Promise<{ ok: boolean; error?: string }>) => void; onClose: () => void }) {
  const [name, setName] = useState("");
  const [typedCode, setTypedCode] = useState<string | null>(null);
  const code = typedCode ?? suggestedCode(name);

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          const r = await adminAddSemester({ code, name });
          if (r.ok) {
            setName("");
            setTypedCode(null);
            onClose();
          }
          return r;
        });
      }}
    >
      <label className={`${FIELD_LABEL} w-full md:w-48`}>
        Name
        <input className={FIELD} value={name} onChange={(e) => setName(e.target.value)} placeholder="Fall 2028" autoFocus />
      </label>
      <label className={`${FIELD_LABEL} w-full md:w-28`}>
        Code
        <input className={FIELD} value={code} onChange={(e) => setTypedCode(e.target.value)} placeholder="fall28" />
      </label>
      <button type="submit" className={`${BTN_PRIMARY} md:mb-0.5`} disabled={pending || !name.trim() || !code}>
        Add
      </button>
      <button type="button" className={`${BTN} md:mb-0.5`} onClick={onClose}>
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
      className={DIALOG}
    >
      {plan && t && (
        <div className="flex max-h-[85dvh] flex-col gap-3 overflow-y-auto p-4">
          <h2 className={CARD_TITLE}>Archive {plan.name}</h2>
          {plan.blocking.length > 0 ? (
            <ul className="text-[13px] text-error-ink">
              {plan.blocking.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          ) : (
            <>
              {t.listings === 0 ? (
                <p className={MUTED}>No listing runs only for it, so nothing is removed; it moves to Archived.</p>
              ) : (
                <p className={MUTED}>
                  Removes {plural(t.listings, "listing")} for good ({t.taken} taken) with {plural(t.photos, "photo")} ({formatBytes(t.bytes)}). A totals row is kept: median{" "}
                  {t.priceMedian === null ? "—" : formatMoney(t.priceMedian)}, {t.views} viewed, {t.contacts} got in touch.
                </p>
              )}
              {plan.going.length > 0 && (
                <details>
                  <summary className={FOLD}>The {plural(plan.going.length, "listing")} going</summary>
                  <ul className="mt-1 flex flex-col gap-0.5 text-[13px] text-ink-2">
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
                <p className={MUTED}>
                  Staying, because they run on into a later semester: {plan.staying.map((s) => `${s.ownerName ?? s.ownerEmail} → ${s.nextSemester}`).join("; ")}.
                </p>
              )}
              <label className={FIELD_LABEL}>
                Type {plan.code} to confirm
                <input className={`${FIELD} md:w-40`} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
              </label>
              {error && (
                <p role="alert" className="text-[13px] text-error-ink">
                  {error}
                </p>
              )}
            </>
          )}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {plan.blocking.length === 0 && (
              <button
                type="button"
                className={BTN_DANGER}
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
            <button type="button" className={BTN} onClick={() => ref.current?.close()}>
              {plan.blocking.length > 0 ? "Close" : "Cancel"}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}

/**
 * "Is your sublet still available?" for one semester: who it goes to (the
 * listings archiving would remove, less anyone already asked or answered,
 * banned, or off email), then the code typed back to send. Nothing goes out
 * until Send.
 */
function AskDialog({ preview, onClose, onSent }: { preview: AskPreview | null; onClose: () => void; onSent: (result: string) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [pending, start] = useTransition();
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (preview && d && !d.open) d.showModal();
    if (!preview && d?.open) d.close();
  }, [preview]);

  const n = preview?.recipients.length ?? 0;
  return (
    <dialog
      ref={ref}
      onClose={() => {
        setTyped("");
        setError(null);
        onClose();
      }}
      className={DIALOG}
    >
      {preview && (
        <div className="flex max-h-[85dvh] flex-col gap-3 overflow-y-auto p-4">
          <h2 className={CARD_TITLE}>Ask {preview.name} posters</h2>
          <p className={MUTED}>
            Emails “Is your sublet still available?” with four one-tap answers (no sign-in; the links work after the listing is gone). Goes to
            the listings archiving would remove, less anyone already asked or answered, banned, or marked Stop email.
            {preview.alreadyAsked > 0 ? ` Already sent for this semester: ${plural(preview.alreadyAsked, "listing")}.` : ""}
          </p>
          {preview.blocking.length > 0 ? (
            <ul className="text-[13px] text-error-ink">
              {preview.blocking.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          ) : n === 0 ? (
            <p className={MUTED}>Nobody to ask right now.</p>
          ) : (
            <>
              <details>
                <summary className={FOLD}>Goes to {plural(n, "poster")}</summary>
                <ul className="mt-1 flex flex-col gap-0.5 text-[13px] text-ink-2">
                  {preview.recipients.map((r) => (
                    <li key={r.listingId} title={r.email}>
                      {r.name ?? r.email} · {r.place}
                      {r.status !== "open" ? ` · ${r.status}` : ""}
                    </li>
                  ))}
                </ul>
              </details>
              <label className={FIELD_LABEL}>
                Type {preview.code} to send
                <input className={`${FIELD} md:w-40`} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
              </label>
              {error && (
                <p role="alert" className="text-[13px] text-error-ink">
                  {error}
                </p>
              )}
            </>
          )}
          {preview.testListings.length > 0 && <AskTest preview={preview} />}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {preview.blocking.length === 0 && n > 0 && (
              <button
                type="button"
                className={BTN_PRIMARY}
                disabled={pending || typed !== preview.code}
                onClick={() =>
                  start(async () => {
                    const r = await adminSendOutcomeAsks(preview.code, typed);
                    if (!r.ok) return setError(r.error);
                    setTyped("");
                    const { sent, failed, skipped } = r.data;
                    onSent(`Asked ${preview.name} posters: ${plural(sent, "email")} sent${failed ? `, ${failed} failed (send again to retry them)` : ""}${skipped ? `, ${skipped} already sent` : ""}.`);
                  })
                }
              >
                {pending ? "Sending…" : `Send to ${plural(n, "poster")}`}
              </button>
            )}
            <button type="button" className={BTN} onClick={() => ref.current?.close()}>
              {preview.blocking.length > 0 || n === 0 ? "Close" : "Cancel"}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}

/**
 * "Send test to me": the email for any listing, with its real signed links,
 * to the signed-in admin only. Records no ask. The links are live, so the
 * warning says what tapping Filled does.
 */
function AskTest({ preview }: { preview: AskPreview }) {
  const [pending, start] = useTransition();
  const [listingId, setListingId] = useState(preview.testListings[0].listingId);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <details className="border-t border-line-light pt-1 md:pt-3">
      <summary className={FOLD}>Send test to me</summary>
      <div className="mt-2 flex flex-col gap-3">
        <p className={MUTED}>
          The email for one listing, with that listing&apos;s real links, sent only to your own address. No ask is recorded, so the real send
          still goes to its poster. The links are live: Filled marks that listing taken and Still available stamps it.
        </p>
        <label className={FIELD_LABEL}>
          Listing
          <select className={SELECT} value={listingId} onChange={(e) => setListingId(Number(e.target.value))}>
            {preview.testListings.map((l) => (
              <option key={l.listingId} value={l.listingId}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={BTN}
            disabled={pending}
            onClick={() =>
              start(async () => {
                setNote(null);
                const r = await adminSendOutcomeAskTest(preview.code, listingId);
                setNote(r.ok ? { ok: true, text: `Sent to ${r.data.to}.` } : { ok: false, text: r.error });
              })
            }
          >
            {pending ? "Sending…" : "Send test to me"}
          </button>
          {note && (
            <span role={note.ok ? "status" : "alert"} className={`text-[13px] ${note.ok ? "text-ink-2" : "text-error-ink"}`}>
              {note.text}
            </span>
          )}
        </div>
      </div>
    </details>
  );
}
