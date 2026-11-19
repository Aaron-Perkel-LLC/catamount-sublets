"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { shortDate } from "@/lib/dates";
import { adminApproveAccessRequest, adminDismissAccessRequest, adminRevokeApprovedEmail } from "@/server/actions/admin";
import { Card, Empty } from "./Card";
import { type AdminMessageDto, MailComposer, MailHistory } from "./MailComposer";
import { Pill } from "./Pill";
import { BTN, BTN_DANGER, BTN_PRIMARY, CARD_TITLE, GROUP, LABEL, MUTED } from "./ui";

export interface AccessRequestDto {
  id: number;
  kind: string;
  name: string;
  email: string;
  school: string | null;
  message: string;
  createdAt: string;
  /** Replies sent from the console, newest first. */
  messages: AdminMessageDto[];
}
export interface RequestsDto {
  pending: AccessRequestDto[];
  approved: string[];
}

/**
 * The front page's "Request access" and "Request your school", waiting for an
 * answer, a card each. Reply writes to them from here and can approve or
 * decline in the same step; Approve and Dismiss do it without a message.
 * Beside them on a wide screen, the addresses already let in.
 */
export function RequestsTab({ requests }: { requests: RequestsDto }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const [replying, setReplying] = useState<number | null>(null);

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
                  {r.messages.length > 0 && (
                    <div className="-mx-4 flex flex-col gap-1.5">
                      <h3 className={`${GROUP} px-4`}>Replies</h3>
                      <MailHistory messages={r.messages} showRecipient={false} />
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={BTN_PRIMARY} disabled={pending} aria-expanded={replying === r.id} onClick={() => setReplying(replying === r.id ? null : r.id)}>
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
                  {replying === r.id && (
                    <div className="-mx-4 border-t border-line-light px-4 pt-4">
                      <MailComposer request={r} onDone={() => setReplying(null)} />
                    </div>
                  )}
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
