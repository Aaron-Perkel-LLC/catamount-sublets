"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { unsubscribeAction } from "@/server/actions/digest";

/**
 * The confirm button on /unsubscribe. Opening the page changes nothing, even
 * with JavaScript running (Microsoft Safe Links fetches and runs the links in
 * a message); unsubscribing is this tap's POST.
 */
export function UnsubscribeConfirm({ token, alreadyOff }: { token: string; alreadyOff: boolean }) {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (done || alreadyOff) {
    return (
      <div role="status" className="rounded-2xl border border-included-line bg-included-tint p-4 text-included-ink">
        <p className="font-bold">{done ? "Done. You won't get the weekly email any more." : "You're already unsubscribed from the weekly email."}</p>
        <p className="mt-1 text-sm">
          Your saved searches are still there. Turn the email back on any time from{" "}
          <Link href="/account#alerts" className="link">
            Account
          </Link>
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
            const r = await unsubscribeAction(token);
            if (r.ok) setDone(true);
            else setError("That link isn't valid any more. Turn the email off from Account instead.");
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
