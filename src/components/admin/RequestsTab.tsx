"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { shortDate } from "@/lib/dates";
import { adminApproveAccessRequest, adminDismissAccessRequest, adminRevokeApprovedEmail } from "@/server/actions/admin";

export interface AccessRequestDto {
  id: number;
  kind: string;
  name: string;
  email: string;
  school: string | null;
  message: string;
  createdAt: string;
}
export interface RequestsDto {
  pending: AccessRequestDto[];
  approved: string[];
}

/**
 * The front page's "Request access" and "Request your school", waiting for an
 * answer. Approve lets that address sign in; Dismiss closes it. Either way,
 * reply to the request email to tell them.
 */
export function RequestsTab({ requests }: { requests: RequestsDto }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, done: string) =>
    start(async () => {
      const r = await fn();
      setNote(r.ok ? done : r.error);
      router.refresh();
    });

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      {note && (
        <p role="status" className="text-sm text-ink-2">
          {note}
        </p>
      )}
      {requests.pending.length === 0 ? (
        <p className="text-sm text-ink-3">No requests waiting.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {requests.pending.map((r) => (
            <li key={r.id} className="flex flex-col gap-2 rounded-xl border border-line bg-paper p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <h3 className="font-bold">
                  {r.name} <span className="font-normal text-ink-3">· {r.kind === "school" ? "School request" : "Access request"}</span>
                </h3>
                <span className="text-xs text-ink-3">
                  #{r.id} · {shortDate(new Date(r.createdAt))}
                </span>
              </div>
              <p className="break-all text-sm">{r.email}</p>
              {r.school && <p className="text-sm text-ink-2">{r.kind === "school" ? `School: ${r.school}` : `School or connection: ${r.school}`}</p>}
              {r.message && <p className="whitespace-pre-line text-sm text-ink-2">{r.message}</p>}
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  className="btn-primary px-3 py-1.5 text-sm"
                  disabled={pending}
                  onClick={() => confirm(`Let ${r.email} sign in?`) && run(() => adminApproveAccessRequest(r.id), `Approved. ${r.email} can sign in now; reply to their request email to tell them.`)}
                >
                  Approve
                </button>
                <button type="button" className="btn-secondary px-3 py-1.5 text-sm" disabled={pending} onClick={() => run(() => adminDismissAccessRequest(r.id), `Dismissed request #${r.id}.`)}>
                  Dismiss
                </button>
              </div>
              {r.kind === "school" && <p className="text-xs text-ink-3">Approve lets this one address in. Opening a whole school is a code change.</p>}
            </li>
          ))}
        </ul>
      )}

      <section className="flex flex-col gap-2 rounded-xl border border-line bg-paper p-4">
        <div>
          <h3 className="font-bold">Approved addresses</h3>
          <p className="text-sm text-ink-3">May sign in although their domain isn&apos;t allowed. Removing one stops new sign-ins; to cut off an existing account, ban it in People.</p>
        </div>
        {requests.approved.length === 0 ? (
          <p className="text-sm text-ink-3">None yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line-light">
            {requests.approved.map((email) => (
              <li key={email} className="flex items-center justify-between gap-3 py-2">
                <span className="break-all text-sm">{email}</span>
                <button
                  type="button"
                  className="btn-secondary px-2 py-1 text-xs text-error-ink"
                  disabled={pending}
                  onClick={() => confirm(`Remove ${email}? They won't be able to sign in again.`) && run(() => adminRevokeApprovedEmail(email), `Removed ${email}.`)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
