"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { shortDate } from "@/lib/dates";
import type { DeliveryStatus } from "@/lib/email";
import { adminApproveAccessRequest, adminDismissAccessRequest, adminRevokeApprovedEmail } from "@/server/actions/admin";
import { adminEmailNew } from "@/server/actions/admin-email";
import { useAdmin } from "./AdminShell";
import { Card, Empty } from "./Card";
import { Pill, type PillTone } from "./Pill";
import { BTN, BTN_DANGER, BTN_PRIMARY, CARD_TITLE, GROUP, LABEL, LINK, MUTED } from "./ui";

/** A reply written to a request from Email: a draft still being written, or what happened to it once sent. */
export interface RequestReplyDto {
  id: number;
  subject: string;
  /** Null while it is still a draft. */
  status: DeliveryStatus | null;
  reason: string | null;
  at: string;
}
const REPLY: Record<DeliveryStatus, [PillTone, string]> = { sent: ["good", "Sent"], failed: ["bad", "Failed"], queued: ["warn", "Sending"], sending: ["warn", "Sending"], left_out: ["outline", "Not sent"] };

export interface AccessRequestDto {
  id: number;
  kind: string;
  name: string;
  email: string;
  school: string | null;
  message: string;
  createdAt: string;
  /** Replies written to it in Email, newest first. */
  replies: RequestReplyDto[];
}
export interface RequestsDto {
  pending: AccessRequestDto[];
  approved: string[];
}

/**
 * The front page's "Request access" and "Request your school", waiting for an
 * answer, a card each. Reply opens an email to them in Email, with its
 * starting text, which can approve or decline the request once it has gone;
 * Approve and Dismiss do it without a message.
 * Beside them on a wide screen, the addresses already let in.
 */
export function RequestsTab({ requests }: { requests: RequestsDto }) {
  const router = useRouter();
  const { href } = useAdmin();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  const reply = (requestId: number) =>
    start(async () => {
      const r = await adminEmailNew({ requestId });
      if (r.ok) router.push(href(`/admin/email/${r.data.id}`));
      else setNote(r.error);
    });

  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, done: string) =>
    start(async () => {
      const r = await fn();
      setNote(r.ok ? done : r.error);
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-4">
      {note && (
        <p role="status" className="text-[13px] text-ink-2">
          {note}
        </p>
      )}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        {requests.pending.length === 0 ? (
          <Card>
            <Empty>No requests waiting.</Empty>
          </Card>
        ) : (
          <ul className="flex min-w-0 flex-col gap-4">
            {requests.pending.map((r) => (
              <li key={r.id}>
                <Card>
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <h2 className={`${CARD_TITLE} flex flex-wrap items-center gap-2`}>
                      {r.name}
                      <Pill tone={r.kind === "school" ? "info" : "muted"}>{r.kind === "school" ? "School request" : "Access request"}</Pill>
                    </h2>
                    <span className={`${LABEL} tabular-nums`}>
                      #{r.id} · {shortDate(new Date(r.createdAt))}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1 text-[13px]">
                    <p className="break-all">{r.email}</p>
                    {r.school && (
                      <p className="text-ink-2">
                        <span className="text-ink-3">{r.kind === "school" ? "School:" : "School or connection:"}</span> {r.school}
                      </p>
                    )}
                    {r.message && <p className="whitespace-pre-line text-ink-2">{r.message}</p>}
                  </div>
                  {r.replies.length > 0 && (
                    <div className="flex flex-col gap-1">
                      <h3 className={GROUP}>Replies</h3>
                      <ul className="flex flex-col">
                        {r.replies.map((m) => (
                          <li key={m.id} className="flex min-h-11 items-center justify-between gap-3 md:min-h-8">
                            <Link href={href(`/admin/email/${m.id}`)} className={`${LINK} min-w-0 font-normal`} title={m.reason ?? undefined}>
                              <span className="truncate">{m.subject || "No subject yet"}</span>
                            </Link>
                            <span className="flex shrink-0 items-center gap-2">
                              <span className={`${LABEL} tabular-nums`}>{shortDate(new Date(m.at))}</span>
                              <Pill tone={m.status ? REPLY[m.status][0] : "muted"}>{m.status ? REPLY[m.status][1] : "Draft"}</Pill>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={BTN_PRIMARY} disabled={pending} onClick={() => reply(r.id)}>
                      Reply
                    </button>
                    <button
                      type="button"
                      className={BTN}
                      disabled={pending}
                      onClick={() => confirm(`Let ${r.email} sign in?`) && run(() => adminApproveAccessRequest(r.id), `Approved. ${r.email} can sign in now; reply to their request email to tell them.`)}
                    >
                      Approve
                    </button>
                    <button type="button" className={BTN} disabled={pending} onClick={() => run(() => adminDismissAccessRequest(r.id), `Dismissed request #${r.id}.`)}>
                      Dismiss
                    </button>
                  </div>
                  {r.kind === "school" && <p className={LABEL}>Approve lets this one address in. Opening a whole school is a code change.</p>}
                </Card>
              </li>
            ))}
          </ul>
        )}

        <Card
          flush
          title="Approved addresses"
          tip="May sign in although their domain isn't allowed. Removing one stops new sign-ins; to cut off an existing account, ban it in People."
          actions={requests.approved.length > 0 && <span className={`${MUTED} tabular-nums`}>{requests.approved.length}</span>}
        >
          {requests.approved.length === 0 ? (
            <div className="px-4">
              <Empty>None yet.</Empty>
            </div>
          ) : (
            <ul className="divide-y divide-line-light border-t border-line-light">
              {requests.approved.map((email) => (
                <li key={email} className="flex items-center justify-between gap-3 px-4 py-1.5">
                  <span className="text-[13px] break-all">{email}</span>
                  <button
                    type="button"
                    className={BTN_DANGER}
                    disabled={pending}
                    onClick={() => confirm(`Remove ${email}? They won't be able to sign in again.`) && run(() => adminRevokeApprovedEmail(email), `Removed ${email}.`)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
