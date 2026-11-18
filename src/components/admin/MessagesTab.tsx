"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { shortDate } from "@/lib/dates";
import { adminSetBanned } from "@/server/actions/admin";

/** One relayed message, for the admin (PosterMessageRow with dates as strings). */
export interface RelayMessageDto {
  id: number;
  createdAt: string;
  status: "pending" | "sent" | "failed";
  error: string | null;
  body: string;
  listingId: number | null;
  sender: { id: string; name: string | null; email: string; tier: "student" | "community"; banned: boolean };
  poster: { id: string; name: string | null };
}

export interface RelayAdminDto {
  messages: RelayMessageDto[];
  counts: { days: 7 | 30; sent: number; senders: number; listings: number }[];
}

/**
 * Messages community accounts sent posters through the relay: who, about
 * which listing, the text, and whether it went. For abuse review: Block bans
 * the sender (signed out everywhere, no more sign-in). Kept 180 days.
 */
export function MessagesTab({ relay, onOpenPost }: { relay: RelayAdminDto; onOpenPost: (id: number) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  const block = (m: RelayMessageDto) => {
    const who = m.sender.name ? `${m.sender.name} (${m.sender.email})` : m.sender.email;
    if (!m.sender.banned && !confirm(`Block ${who}? They're signed out everywhere and can't sign in again.`)) return;
    start(async () => {
      const r = await adminSetBanned(m.sender.id, !m.sender.banned, m.sender.banned ? null : `Blocked from Messages (message #${m.id}).`);
      setNote(r.ok ? (m.sender.banned ? `Unblocked ${who}.` : `Blocked ${who}.`) : r.error);
      if (r.ok) router.refresh();
    });
  };

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {relay.counts.map((c) => (
          <div key={c.days} className="rounded-xl border border-line bg-paper p-3">
            <dt className="text-xs text-ink-3">Last {c.days} days</dt>
            <dd className="text-lg font-bold">
              {c.sent} sent
              <span className="block text-xs font-normal text-ink-3">
                {c.senders} sender{c.senders === 1 ? "" : "s"} · {c.listings} listing{c.listings === 1 ? "" : "s"}
              </span>
            </dd>
          </div>
        ))}
      </dl>
      {note && (
        <p role="status" className="text-sm text-ink-2">
          {note}
        </p>
      )}
      {relay.messages.length === 0 ? (
        <p className="text-ink-3">No messages yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {relay.messages.map((m) => (
            <li key={m.id} className="flex flex-col gap-2 rounded-xl border border-line bg-paper p-3 text-sm">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="font-bold">{m.sender.name ?? m.sender.email}</span>
                {m.sender.name && <span className="break-all text-ink-3">{m.sender.email}</span>}
                <span className="text-ink-3">to {m.poster.name ?? "the poster"}</span>
                {m.listingId ? (
                  <button type="button" className="link" onClick={() => onOpenPost(m.listingId!)}>
                    #{m.listingId}
                  </button>
                ) : (
                  <span className="text-ink-3">(listing gone)</span>
                )}
                <span className="ml-auto text-xs text-ink-3">{shortDate(new Date(m.createdAt))}</span>
              </div>
              <p className="whitespace-pre-wrap text-ink">{m.body}</p>
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span className={m.status === "failed" ? "text-error-ink" : "text-ink-3"}>
                  {m.status === "sent" ? "Sent" : m.status === "pending" ? "Sending" : `Failed: ${m.error ?? "unknown"}`}
                </span>
                {m.sender.banned && <span className="text-error-ink">sender blocked</span>}
                <button type="button" className="link ml-auto" disabled={pending} onClick={() => block(m)}>
                  {m.sender.banned ? "Unblock sender" : "Block sender…"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
