"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { adminBroadcastCount, adminSendBroadcast, adminSetAnnouncement, adminSetReadOnly } from "@/server/actions/admin";
import type { Announcement, ReadOnly } from "@/server/data/settings";
import type { Audience } from "@/server/services/admin";
import { AnnouncementBanner } from "../AnnouncementBanner";
import type { PersonDto, SemesterRowDto } from "./AdminTabs";

/** Telling people things: the banner on every signed-in page, an email, and (folded away) the read-only switch. */
export function AnnounceTab({ announcement, readOnly, semesters, people }: { announcement: Announcement; readOnly: ReadOnly; semesters: SemesterRowDto[]; people: PersonDto[] }) {
  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <Card title="Banner" hint="Shown across the top of every signed-in page until you clear it.">
        <BannerForm announcement={announcement} />
      </Card>
      <Card title="Email" hint="Sent from the site's address; replies come to you.">
        <EmailForm semesters={semesters} people={people} />
      </Card>
      <Maintenance readOnly={readOnly} />
    </div>
  );
}

function Card({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-line bg-paper p-4">
      <div>
        <h3 className="font-bold">{title}</h3>
        <p className="text-sm text-ink-3">{hint}</p>
      </div>
      {children}
    </section>
  );
}

function BannerForm({ announcement }: { announcement: Announcement }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState<Announcement>(announcement);
  const [note, setNote] = useState<string | null>(null);

  const save = (a: Announcement) =>
    start(async () => {
      const r = await adminSetAnnouncement(a);
      setNote(r.ok ? (a.active ? "Published." : "Cleared.") : r.error);
      if (r.ok) router.refresh();
    });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Style
          <select className="field w-36" value={draft.style} onChange={(e) => setDraft({ ...draft, style: e.target.value as Announcement["style"] })}>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="success">Success</option>
          </select>
        </label>
        <p className="pb-2 text-sm text-ink-2">{announcement.active ? "A banner is up now." : "No banner is up."}</p>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        Message
        <textarea className="field" rows={3} value={draft.message} onChange={(e) => setDraft({ ...draft, message: e.target.value })} placeholder="Spring listings open Monday…" />
      </label>
      {draft.message && (
        <div className="overflow-hidden rounded-lg border border-line">
          <AnnouncementBanner key={draft.message + draft.style} announcement={{ ...draft, active: true }} />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-primary" disabled={pending || !draft.message.trim()} onClick={() => save({ ...draft, active: true })}>
          Publish
        </button>
        <button type="button" className="btn-secondary" disabled={pending || !announcement.active} onClick={() => confirm("Clear the banner?") && save({ active: false, message: "", style: "info" })}>
          Clear
        </button>
        {note && (
          <span role="status" className="text-sm text-ink-2">
            {note}
          </span>
        )}
      </div>
    </div>
  );
}

/** The read-only switch, for a migration or an outage: out of the way, but open by itself while it is on. */
function Maintenance({ readOnly }: { readOnly: ReadOnly }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [ro, setRo] = useState<ReadOnly>(readOnly);
  const [note, setNote] = useState<string | null>(null);

  return (
    <details open={readOnly.active} className="rounded-xl border border-line bg-paper p-4 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-bold">
        Maintenance
        <span className={`text-sm font-normal ${readOnly.active ? "rounded-full bg-error-tint px-2 text-error-ink" : "text-ink-3"}`}>{readOnly.active ? "Read-only is on" : "Read-only switch"}</span>
      </summary>
      <div className="mt-3 flex flex-col gap-3">
        <p className="text-sm text-ink-2">While on, every write (posting, editing, photos, status, account deletion) is refused with this message. Reading and signing in keep working.</p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4" checked={ro.active} onChange={(e) => setRo({ ...ro, active: e.target.checked })} />
          Site is read-only
        </label>
        <input className="field" placeholder="The site is read-only while it moves." value={ro.message} onChange={(e) => setRo({ ...ro, message: e.target.value })} />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn-secondary"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await adminSetReadOnly(ro.active, ro.message);
                setNote(r.ok ? (ro.active ? "Read-only is on." : "Read-only is off.") : r.error);
                if (r.ok) router.refresh();
              })
            }
          >
            Save switch
          </button>
          {note && (
            <span role="status" className="text-sm text-ink-2">
              {note}
            </span>
          )}
        </div>
      </div>
    </details>
  );
}

/** A broadcast: to posters on the board, every account, posters in a semester, people yet to answer the survey, or named people. */
function EmailForm({ semesters, people }: { semesters: SemesterRowDto[]; people: PersonDto[] }) {
  const [kind, setKind] = useState<Audience["kind"]>("all");
  const [code, setCode] = useState(semesters.find((s) => s.active)?.code ?? "");
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [count, setCount] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const audience: Audience = kind === "all" || kind === "accounts" || kind === "survey" ? { kind } : kind === "semester" ? { kind, code } : { kind, userIds: [...ids] };
  const key = JSON.stringify(audience);
  useEffect(() => {
    let cancelled = false;
    adminBroadcastCount(JSON.parse(key)).then((n) => !cancelled && setCount(n));
    return () => {
      cancelled = true;
    };
  }, [key]);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!confirm(`Send to ${count ?? "?"} people?`)) return;
        start(async () => {
          const r = await adminSendBroadcast(audience, subject, body);
          setNote(r.ok ? `Sent to ${r.data.sent} recipient(s)${r.data.failed ? `, ${r.data.failed} failed` : ""}.` : r.error);
          if (r.ok) {
            setSubject("");
            setBody("");
          }
        });
      }}
    >
      <fieldset className="flex flex-col gap-2 text-sm">
        <legend className="font-bold">To</legend>
        <label className="flex items-center gap-2">
          <input type="radio" name="kind" checked={kind === "all"} onChange={() => setKind("all")} /> Everyone with a listing on the board
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="kind" checked={kind === "accounts"} onChange={() => setKind("accounts")} /> Every account, with or without a listing
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="kind" checked={kind === "semester"} onChange={() => setKind("semester")} /> Every poster in a semester
          {kind === "semester" && (
            <select className="field w-44 py-1" value={code} onChange={(e) => setCode(e.target.value)}>
              {semesters.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="kind" checked={kind === "survey"} onChange={() => setKind("survey")} /> Everyone who hasn&apos;t answered the survey
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="kind" checked={kind === "individual"} onChange={() => setKind("individual")} /> Named people
        </label>
        {kind === "individual" && (
          <div className="grid max-h-48 grid-cols-1 gap-1 overflow-y-auto rounded-lg border border-line bg-paper p-2 sm:grid-cols-2">
            {people.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={ids.has(p.id)}
                  onChange={(e) => {
                    const next = new Set(ids);
                    if (e.target.checked) next.add(p.id);
                    else next.delete(p.id);
                    setIds(next);
                  }}
                />
                {p.name ? `${p.name} · ${p.email}` : p.email}
              </label>
            ))}
          </div>
        )}
        <p className="text-xs text-ink-3">{count === null ? "Counting…" : `${count} recipient${count === 1 ? "" : "s"}. Banned people are never included.`}</p>
      </fieldset>
      <label className="flex flex-col gap-1 text-sm">
        Subject
        <input className="field" value={subject} onChange={(e) => setSubject(e.target.value)} required maxLength={150} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Message <span className="text-xs text-ink-3">{"{name}"} is the person&apos;s name; without it a greeting is added. {"{survey}"} is their own survey link. Blank lines separate paragraphs. The sign-off is added for you.</span>
        <textarea className="field" rows={8} value={body} onChange={(e) => setBody(e.target.value)} required maxLength={10000} />
      </label>
      <button type="submit" className="btn-primary self-start" disabled={pending || !subject.trim() || !body.trim() || !count}>
        {pending ? "Sending…" : "Send"}
      </button>
      {note && <p className="text-sm text-ink-2">{note}</p>}
    </form>
  );
}
