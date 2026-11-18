"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { adminDeleteNotice, adminDuplicateNotice, adminSaveNotice, adminSetNoticeActive } from "@/server/actions/admin";
import { deadlineWords } from "@/lib/dates";
import { NOTICE_AUDIENCE_LABELS, NOTICE_AUDIENCES, NOTICE_LIMITS, noticeInput, type NoticeAudience, type NoticeInput } from "@/lib/notices";
import type { NoticeAdminRow } from "@/server/data/notices";
import { NoticeCard } from "../notices/NoticeDialog";
import { NoticeMarkdown } from "../notices/NoticeMarkdown";

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
 * Announce → Popup: the notices, newest first, with what each has done
 * (distinct people), and the form with a live preview that is the real card.
 * Nothing here dismisses or counts anything.
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
    <div className="flex flex-col gap-3">
      {active ? (
        <p className="text-sm text-ink-2">
          Live now: <span className="font-bold">{active.title}</span> ({NOTICE_AUDIENCE_LABELS[active.audience]}).
        </p>
      ) : (
        <p className="text-sm text-ink-2">No popup is live.</p>
      )}

      {notices.length > 0 && (
        <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
          {notices.map((n) => (
            <li key={n.id} className="flex flex-col gap-2 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-bold">{n.title}</span>
                <Status n={n} />
              </div>
              <p className="text-xs text-ink-3">
                {NOTICE_AUDIENCE_LABELS[n.audience]} · {n.endsOn ? `ends ${deadlineWords(n.endsOn).short}` : "no end date"} · {n.views} seen · {n.dismissals} dismissed · {n.ctaClicks} button
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-secondary px-3 py-1.5 text-sm" disabled={pending} onClick={() => setEditing({ id: n.id, values: valuesOf(n) })}>
                  Edit
                </button>
                {n.active ? (
                  <button type="button" className="btn-secondary px-3 py-1.5 text-sm" disabled={pending} onClick={() => run(() => adminSetNoticeActive(n.id, false), "Taken down.")}>
                    Deactivate
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-secondary px-3 py-1.5 text-sm"
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
                <button type="button" className="btn-secondary px-3 py-1.5 text-sm" disabled={pending} onClick={() => run(() => adminDuplicateNotice(n.id), "Duplicated, not live yet.")}>
                  Duplicate
                </button>
                <button
                  type="button"
                  className="btn-secondary px-3 py-1.5 text-sm text-error-ink"
                  disabled={pending}
                  onClick={() => confirm(`Delete "${n.title}" and its counts? This can't be undone.`) && run(() => adminDeleteNotice(n.id), "Deleted.")}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing ? (
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
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-primary" onClick={() => setEditing({ id: null, values: EMPTY })}>
            New popup
          </button>
          {note && (
            <span role="status" className="text-sm text-ink-2">
              {note}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function Status({ n }: { n: NoticeAdminRow }) {
  const [label, tone] = n.active && !n.ended ? ["Live", "bg-included-tint text-included-ink"] : n.ended ? ["Ended", "bg-line-light text-ink-3"] : ["Off", "bg-line-light text-ink-3"];
  return <span className={`rounded-full px-2 text-xs font-bold ${tone}`}>{label}</span>;
}

function NoticeForm({ id, initial, live, onDone, onCancel }: { id: number | null; initial: NoticeInput; live: boolean; onDone: (note: string) => void; onCancel: () => void }) {
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
    <div className="flex flex-col gap-3 rounded-lg border border-line p-3">
      <h4 className="font-bold">{id === null ? "New popup" : "Edit popup"}</h4>
      {live && <p className="text-sm text-ink-2">This one is live. Saving changes it for people who haven&apos;t dismissed it yet; it doesn&apos;t show again to anyone who has. To show it again, duplicate it.</p>}
      <label className="flex flex-col gap-1 text-sm">
        Title
        <input className="field" maxLength={NOTICE_LIMITS.title} value={v.title} onChange={(e) => set({ title: e.target.value })} />
        {fieldError("title")}
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="flex justify-between">
          Body (Markdown)
          <span className="text-xs text-ink-3">
            {v.bodyMd.length}/{NOTICE_LIMITS.body}
          </span>
        </span>
        <textarea className="field font-mono text-sm" rows={8} value={v.bodyMd} onChange={(e) => set({ bodyMd: e.target.value })} />
        <span className="text-xs text-ink-3">**bold**, *italic*, [links](/browse), lists, ### headings, &gt; quotes. No images or HTML.</span>
        {fieldError("bodyMd")}
      </label>
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Who sees it
          <select className="field w-56" value={v.audience} onChange={(e) => set({ audience: e.target.value as NoticeAudience })}>
            {NOTICE_AUDIENCES.map((a) => (
              <option key={a} value={a}>
                {NOTICE_AUDIENCE_LABELS[a]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Last day (optional)
          <input type="date" className="field w-44" value={v.endsOn ?? ""} onChange={(e) => set({ endsOn: e.target.value })} />
          {fieldError("endsOn")}
        </label>
      </div>
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Button label (optional)
          <input className="field w-48" maxLength={NOTICE_LIMITS.ctaLabel} value={v.ctaLabel ?? ""} onChange={(e) => set({ ctaLabel: e.target.value })} placeholder="Open My post" />
          {fieldError("ctaLabel")}
        </label>
        <label className="flex flex-1 flex-col gap-1 text-sm">
          Button link
          <input className="field" maxLength={NOTICE_LIMITS.ctaHref} value={v.ctaHref ?? ""} onChange={(e) => set({ ctaHref: e.target.value })} placeholder="/post" />
          {fieldError("ctaHref")}
        </label>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-sm">Preview</span>
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
        <button type="button" className="btn-primary" disabled={pending} onClick={save}>
          Save
        </button>
        <button type="button" className="btn-secondary" disabled={pending} onClick={onCancel}>
          Cancel
        </button>
        {error && (
          <span role="alert" className="text-sm text-error-ink">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
