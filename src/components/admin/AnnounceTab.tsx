"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { adminSetAnnouncement, adminSetReadOnly } from "@/server/actions/admin";
import type { Announcement, ReadOnly } from "@/server/data/settings";
import { AnnouncementBanner } from "../AnnouncementBanner";
import type { NoticeAdminRow } from "@/server/data/notices";
import { Card } from "./Card";
import { NoticesSection } from "./NoticesSection";
import { Pill } from "./Pill";
import { BTN, BTN_PRIMARY, CHOICE, FIELD, FIELD_LABEL, LINK, MUTED, SELECT, TEXTAREA } from "./ui";

/**
 * Telling people things on the site itself: the banner on every signed-in
 * page, and the popups. (Email is its own section; the read-only switch
 * lives in System.)
 */
export function AnnounceTab({ announcement, notices }: { announcement: Announcement; notices: NoticeAdminRow[] }) {
  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <BannerCard announcement={announcement} />
      <NoticesSection notices={notices} />
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
