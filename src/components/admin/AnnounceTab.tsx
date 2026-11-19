"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState, useTransition } from "react";
import { adminBroadcastCount, adminSendBroadcast, adminSetAnnouncement, adminSetReadOnly } from "@/server/actions/admin";
import type { Announcement, ReadOnly } from "@/server/data/settings";
import type { Audience } from "@/server/services/admin";
import { AnnouncementBanner } from "../AnnouncementBanner";
import type { NoticeAdminRow } from "@/server/data/notices";
import { Card } from "./Card";
import { NoticesSection } from "./NoticesSection";
import { Pill } from "./Pill";
import { Tip } from "./Tip";
import type { PersonDto, SemesterRowDto } from "./types";
import { BTN, BTN_PRIMARY, CHOICE, FIELD, FIELD_LABEL, LINK, MUTED, SELECT, TEXTAREA } from "./ui";

/**
 * Telling people things: the banner on every signed-in page and the popups
 * in one column, the broadcast email in the other (one column on a phone).
 * (The read-only switch lives in System.)
 */
export function AnnounceTab({
  announcement,
  semesters,
  people,
  notices,
}: {
  announcement: Announcement;
  semesters: SemesterRowDto[];
  people: PersonDto[];
  notices: NoticeAdminRow[];
}) {
  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-4">
        <BannerCard announcement={announcement} />
        <NoticesSection notices={notices} />
      </div>
      <Card title="Email" tip="A broadcast, sent from the site's address; replies come to you.">
        <EmailForm semesters={semesters} people={people} />
      </Card>
    </div>
  );
}

function BannerCard({ announcement }: { announcement: Announcement }) {
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
    <Card title="Banner" tip="Shown across the top of every signed-in page until you clear it." actions={<Pill tone={announcement.active ? "good" : "muted"}>{announcement.active ? "Live" : "Off"}</Pill>}>
      <div className="grid items-start gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
        <label className={FIELD_LABEL}>
          Message
          <textarea className={TEXTAREA} rows={3} value={draft.message} onChange={(e) => setDraft({ ...draft, message: e.target.value })} placeholder="Spring listings open Monday…" />
        </label>
        <label className={FIELD_LABEL}>
          Style
          <select className={SELECT} value={draft.style} onChange={(e) => setDraft({ ...draft, style: e.target.value as Announcement["style"] })}>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="success">Success</option>
          </select>
        </label>
      </div>
      {draft.message && (
        <div className="overflow-hidden rounded-lg border border-line">
          <AnnouncementBanner key={draft.message + draft.style} announcement={{ ...draft, active: true }} />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={BTN_PRIMARY} disabled={pending || !draft.message.trim()} onClick={() => save({ ...draft, active: true })}>
          Publish
        </button>
        <button type="button" className={BTN} disabled={pending || !announcement.active} onClick={() => confirm("Clear the banner?") && save({ active: false, message: "", style: "info" })}>
          Clear
        </button>
        {note && (
          <span role="status" className={MUTED}>
            {note}
          </span>
        )}
      </div>
    </Card>
  );
}

/**
 * The read-only switch, for a migration or an outage: its state as a pill,
 * and, folded away unless it is on, the message students get and the switch.
 */
export function Maintenance({ readOnly }: { readOnly: ReadOnly }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [ro, setRo] = useState<ReadOnly>(readOnly);
  const [note, setNote] = useState<string | null>(null);

  return (
    <Card title="Read-only mode" tip="For a migration or an outage." actions={<Pill tone={readOnly.active ? "bad" : "muted"}>{readOnly.active ? "On" : "Off"}</Pill>}>
      {/* Folded away unless it is on, as it always was: turning the whole site read-only takes opening this first. */}
      <details open={readOnly.active} className="[&_summary::-webkit-details-marker]:hidden">
        <summary className={`${LINK} cursor-pointer list-none`}>Read-only switch</summary>
        <div className="flex flex-col gap-3 pt-2">
          <p className={MUTED}>While on, every write (posting, editing, photos, status, account deletion) is refused with this message. Reading and signing in keep working.</p>
          <label className={FIELD_LABEL}>
            Message
            <input className={FIELD} placeholder="The site is read-only while it moves." value={ro.message} onChange={(e) => setRo({ ...ro, message: e.target.value })} />
          </label>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <label className={CHOICE}>
              <input type="checkbox" className="h-4 w-4" checked={ro.active} onChange={(e) => setRo({ ...ro, active: e.target.checked })} />
              Site is read-only
            </label>
            <button
              type="button"
              className={BTN}
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
              <span role="status" className={MUTED}>
                {note}
              </span>
            )}
          </div>
        </div>
      </details>
    </Card>
  );
}

/** A broadcast: to posters on the board, every account, posters in a semester, people yet to answer the survey, or named people. */
function EmailForm({ semesters, people }: { semesters: SemesterRowDto[]; people: PersonDto[] }) {
  const bodyId = useId();
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
      className="flex flex-col gap-3"
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
      <fieldset className="flex flex-col">
        <legend className="pb-1 text-xs text-ink-3">To</legend>
        <label className={CHOICE}>
          <input type="radio" name="kind" checked={kind === "all"} onChange={() => setKind("all")} /> Everyone with a listing on the board
        </label>
        <label className={CHOICE}>
          <input type="radio" name="kind" checked={kind === "accounts"} onChange={() => setKind("accounts")} /> Every account, with or without a listing
        </label>
        <div className="flex flex-wrap items-center gap-x-3">
          <label className={CHOICE}>
            <input type="radio" name="kind" checked={kind === "semester"} onChange={() => setKind("semester")} /> Every poster in a semester
          </label>
          {kind === "semester" && (
            <select aria-label="Semester" className={`${SELECT} sm:w-44`} value={code} onChange={(e) => setCode(e.target.value)}>
              {semesters.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <label className={CHOICE}>
          <input type="radio" name="kind" checked={kind === "survey"} onChange={() => setKind("survey")} /> Everyone who hasn&apos;t answered the survey
        </label>
        <label className={CHOICE}>
          <input type="radio" name="kind" checked={kind === "individual"} onChange={() => setKind("individual")} /> Named people
        </label>
        {kind === "individual" && (
          <div className="grid max-h-56 grid-cols-1 gap-x-3 overflow-y-auto rounded-lg border border-line bg-paper px-3 py-1 sm:grid-cols-2">
            {people.map((p) => (
              <label key={p.id} className={`${CHOICE} min-w-0`}>
                <input
                  type="checkbox"
                  className="shrink-0"
                  checked={ids.has(p.id)}
                  onChange={(e) => {
                    const next = new Set(ids);
                    if (e.target.checked) next.add(p.id);
                    else next.delete(p.id);
                    setIds(next);
                  }}
                />
                <span className="truncate">{p.name ? `${p.name} · ${p.email}` : p.email}</span>
              </label>
            ))}
          </div>
        )}
        <p className={`${MUTED} pt-2`}>
          {count === null ? (
            "Counting…"
          ) : (
            <>
              <span className="font-bold text-ink tabular-nums">{count}</span> recipient{count === 1 ? "" : "s"}. Banned people and anyone marked &quot;no email&quot; are never included.
            </>
          )}
        </p>
      </fieldset>
      <label className={FIELD_LABEL}>
        Subject
        <input className={FIELD} value={subject} onChange={(e) => setSubject(e.target.value)} required maxLength={150} />
      </label>
      <div className={FIELD_LABEL}>
        <Tip flat label="About this field" text="{name} is the person's name; without it a greeting is added. {survey} is their own survey link. Blank lines separate paragraphs. The sign-off is added for you." className="self-start">
          <label htmlFor={bodyId}>Message</label>
        </Tip>
        <textarea id={bodyId} className={TEXTAREA} rows={8} value={body} onChange={(e) => setBody(e.target.value)} required maxLength={10000} />
      </div>
      <button type="submit" className={`${BTN_PRIMARY} self-start`} disabled={pending || !subject.trim() || !body.trim() || !count}>
        {pending ? "Sending…" : "Send"}
      </button>
      {note && <p className={MUTED}>{note}</p>}
    </form>
  );
}
