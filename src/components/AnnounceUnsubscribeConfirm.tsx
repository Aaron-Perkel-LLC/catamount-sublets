"use client";

import { useState, useTransition } from "react";
import { announceUnsubscribeAction } from "@/server/actions/email-unsubscribe";

/**
 * The confirm button on /unsubscribe for an announcement's link. Opening the
 * page changes nothing, even with JavaScript running (Microsoft Safe Links
 * fetches and runs the links in a message); unsubscribing is this tap's POST.
 */
export function AnnounceUnsubscribeConfirm({ token, already, contact }: { token: string; already: boolean; contact: string }) {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (done || already) {
    return (
      <div role="status" className="rounded-2xl border border-included-line bg-included-tint p-4 text-included-ink">
        <p className="font-bold">{done ? "Done. You won't get announcements any more." : "You're already unsubscribed from announcements."}</p>
        <p className="mt-1 text-sm">
          Sign-in codes still reach you, since you ask for those. To get announcements again, write to{" "}
          <a href={`mailto:${contact}`} className="link">
            {contact}
          </a>
          .
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        className="btn-primary self-start"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await announceUnsubscribeAction(token);
            if (r.ok) setDone(true);
            else setError("That link isn't valid any more. Reply to the email instead and it will be done by hand.");
          })
        }
      >
        {pending ? "Unsubscribing…" : "Unsubscribe"}
      </button>
      <p role="status" aria-live="polite" className="text-sm text-error-ink">
        {error}
      </p>
    </div>
  );
}
