"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { adminDeleteNotice, adminDuplicateNotice, adminSaveNotice, adminSetNoticeActive } from "@/server/actions/admin";
import { deadlineWords } from "@/lib/dates";
import { NOTICE_AUDIENCE_LABELS, NOTICE_AUDIENCES, NOTICE_LIMITS, noticeInput, type NoticeAudience, type NoticeInput } from "@/lib/notices";
import type { NoticeAdminRow } from "@/server/data/notices";
import { NoticeCard } from "../notices/NoticeDialog";
import { NoticeMarkdown } from "../notices/NoticeMarkdown";
import { Card, Empty } from "./Card";
import { Pill } from "./Pill";
import { Tip } from "./Tip";
import { BTN, BTN_DANGER, BTN_PRIMARY, CARD_TITLE, FIELD, FIELD_LABEL, LABEL, MUTED, SELECT, TEXTAREA } from "./ui";

const EMPTY: NoticeInput = { title: "", bodyMd: "", audience: "posters", ctaLabel: "", ctaHref: "", endsOn: "" };

const valuesOf = (n: NoticeAdminRow): NoticeInput => ({
  title: n.title,
  bodyMd: n.bodyMd,
  audience: n.audience,
  ctaLabel: n.ctaLabel ?? "",
  ctaHref: n.ctaHref ?? "",
  endsOn: n.endsOn ?? "",
});

/**
 * Announce → Popups: the notices as one card, newest first, each with its
 * state as a pill, what it has done over all time (distinct people) and its
 * actions; then the form with a live preview that is the real card. Nothing
 * here dismisses or counts anything.
 */
export function NoticesSection({ notices }: { notices: NoticeAdminRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<{ id: number | null; values: NoticeInput } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const active = notices.find((n) => n.active && !n.ended);

  const run = (work: () => Promise<{ ok: true } | { ok: false; error: string }>, done: string) =>
    start(async () => {
      try {
        const r = await work();
        setNote(r.ok ? done : r.error);
        if (r.ok) router.refresh();
      } catch {
        setNote("That didn't go through. Reload and try again.");
      }
    });

  return (
    <Card
      flush
      title="Popups"
      tip="A popup opens once for each person in its audience until they dismiss it; never on sign-in, the front page or admin. One is live at a time. Each one's counts are distinct people, over all time."
      actions={
        !editing && (
          <button type="button" className={BTN} onClick={() => setEditing({ id: null, values: EMPTY })}>
            New popup
          </button>
        )
      }
    >
      {notices.length === 0 ? (
        <div className="px-4">
          <Empty>No popups yet.</Empty>
        </div>
      ) : (
        <ul className="divide-y divide-line-light border-t border-line-light">
          {notices.map((n) => (
            <li key={n.id} className="flex flex-col gap-2 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[13px] font-bold text-ink">{n.title}</span>
                  <span className={`${LABEL} flex flex-wrap gap-x-3 tabular-nums`}>
                    <span>
                      {NOTICE_AUDIENCE_LABELS[n.audience]} · {n.endsOn ? `ends ${deadlineWords(n.endsOn).short}` : "no end date"}
                    </span>
                    <span className="whitespace-nowrap">
                      {n.views} seen · {n.dismissals} dismissed · {n.ctaClicks} button
                    </span>
                  </span>
                </div>
                <Status n={n} />
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={BTN} disabled={pending} onClick={() => setEditing({ id: n.id, values: valuesOf(n) })}>
                  Edit
                </button>
                {n.active ? (
                  <button type="button" className={BTN} disabled={pending} onClick={() => run(() => adminSetNoticeActive(n.id, false), "Taken down.")}>
                    Deactivate
                  </button>
                ) : (
                  <button
                    type="button"
                    className={BTN}
                    disabled={pending || n.ended}
                    title={n.ended ? "Its end date has passed: duplicate it to show it again." : undefined}
                    onClick={() => {
                      if (active && !confirm(`This replaces the live popup, "${active.title}".`)) return;
                      run(() => adminSetNoticeActive(n.id, true), "Live.");
                    }}
                  >
                    Activate
                  </button>
                )}
                <button type="button" className={BTN} disabled={pending} onClick={() => run(() => adminDuplicateNotice(n.id), "Duplicated, not live yet.")}>
                  Duplicate
                </button>
                <button type="button" className={BTN_DANGER} disabled={pending} onClick={() => confirm(`Delete "${n.title}" and its counts? This can't be undone.`) && run(() => adminDeleteNotice(n.id), "Deleted.")}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing ? (
        <div className="border-t border-line-light px-4 pt-3">
          <NoticeForm
            key={editing.id ?? "new"}
            id={editing.id}
            initial={editing.values}
            live={editing.id !== null && editing.id === active?.id}
            onDone={(msg) => {
              setEditing(null);
              setNote(msg);
              router.refresh();
            }}
            onCancel={() => setEditing(null)}
          />
        </div>
      ) : (
        note && (
          <p role="status" className={`${MUTED} px-4`}>
            {note}
          </p>
        )
      )}
    </Card>
  );
}

/** Live, past its last day, or neither (never switched on, or taken down: the data doesn't say which). */
function Status({ n }: { n: NoticeAdminRow }) {
  if (n.active && !n.ended) return <Pill tone="good">Live</Pill>;
  return <Pill>{n.ended ? "Ended" : "Off"}</Pill>;
}

function NoticeForm({ id, initial, live, onDone, onCancel }: { id: number | null; initial: NoticeInput; live: boolean; onDone: (note: string) => void; onCancel: () => void }) {
  const bodyId = useId();
  const [v, setV] = useState<NoticeInput>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (patch: Partial<NoticeInput>) => setV((prev) => ({ ...prev, ...patch }));

  const save = () => {
    const parsed = noticeInput.safeParse(v);
    if (!parsed.success) {
      const byField: Record<string, string> = {};
      for (const issue of parsed.error.issues) byField[String(issue.path[0])] ??= issue.message;
      setErrors(byField);
      return;
    }
    setErrors({});
    start(async () => {
      try {
        const r = await adminSaveNotice(id, v);
        if (r.ok) onDone(id === null ? "Saved, not live yet: press Activate." : "Saved.");
        else setError(r.error);
      } catch {
        setError("That didn't save. Reload and try again.");
      }
    });
  };

  const fieldError = (k: keyof NoticeInput) =>
    errors[k] ? (
      <span className="text-xs text-error-ink" role="alert">
        {errors[k]}
      </span>
    ) : null;
  const ctaLabel = v.ctaLabel?.trim() ?? "";
  const ctaHref = v.ctaHref?.trim() ?? "";

  return (
    <div className="flex flex-col gap-3">
      <h3 className={CARD_TITLE}>{id === null ? "New popup" : "Edit popup"}</h3>
      {live && <p className={MUTED}>This one is live. Saving changes it for people who haven&apos;t dismissed it yet; it doesn&apos;t show again to anyone who has. To show it again, duplicate it.</p>}
      <label className={FIELD_LABEL}>
        Title
        <input className={FIELD} maxLength={NOTICE_LIMITS.title} value={v.title} onChange={(e) => set({ title: e.target.value })} />
        {fieldError("title")}
      </label>
      <div className={FIELD_LABEL}>
        <span className="flex items-center justify-between gap-3">
          <Tip label="About this field" text="**bold**, *italic*, [links](/browse), lists, ### headings, > quotes. No images or HTML.">
            <label htmlFor={bodyId}>Body (Markdown)</label>
          </Tip>
          <span className="tabular-nums">
            {v.bodyMd.length}/{NOTICE_LIMITS.body}
          </span>
        </span>
        <textarea id={bodyId} className={`${TEXTAREA} font-mono`} rows={8} value={v.bodyMd} onChange={(e) => set({ bodyMd: e.target.value })} />
        {fieldError("bodyMd")}
      </div>
      <div className="grid items-start gap-3 sm:grid-cols-2">
        <label className={FIELD_LABEL}>
          Who sees it
          <select className={SELECT} value={v.audience} onChange={(e) => set({ audience: e.target.value as NoticeAudience })}>
            {NOTICE_AUDIENCES.map((a) => (
              <option key={a} value={a}>
                {NOTICE_AUDIENCE_LABELS[a]}
              </option>
            ))}
          </select>
        </label>
        <label className={FIELD_LABEL}>
          Last day (optional)
          <input type="date" className={FIELD} value={v.endsOn ?? ""} onChange={(e) => set({ endsOn: e.target.value })} />
          {fieldError("endsOn")}
        </label>
        <label className={FIELD_LABEL}>
          Button label (optional)
          <input className={FIELD} maxLength={NOTICE_LIMITS.ctaLabel} value={v.ctaLabel ?? ""} onChange={(e) => set({ ctaLabel: e.target.value })} placeholder="Open My post" />
          {fieldError("ctaLabel")}
        </label>
        <label className={FIELD_LABEL}>
          Button link
          <input className={FIELD} maxLength={NOTICE_LIMITS.ctaHref} value={v.ctaHref ?? ""} onChange={(e) => set({ ctaHref: e.target.value })} placeholder="/post" />
          {fieldError("ctaHref")}
        </label>
      </div>

      <div className="flex flex-col gap-1">
        <span className={LABEL}>Preview</span>
        <div className="flex justify-center rounded-lg bg-ink/60 p-4" aria-label="Preview of the popup">
          <div className="w-full max-w-md">
            <NoticeCard
              notice={{ title: v.title || "Title", ctaLabel: ctaLabel && ctaHref ? ctaLabel : null, ctaHref: ctaLabel && ctaHref ? ctaHref : null }}
              body={
                // Links in the preview go nowhere, so a click can't lose the unsaved draft.
                <div onClickCapture={(e) => e.target instanceof Element && e.target.closest("a") && e.preventDefault()}>
                  <NoticeMarkdown markdown={v.bodyMd} />
                </div>
              }
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={BTN_PRIMARY} disabled={pending} onClick={save}>
          Save
        </button>
        <button type="button" className={BTN} disabled={pending} onClick={onCancel}>
          Cancel
        </button>
        {error && (
          <span role="alert" className="text-[13px] text-error-ink">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
