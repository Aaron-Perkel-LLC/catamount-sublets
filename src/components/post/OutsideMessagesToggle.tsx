"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ACCESS } from "@/config/site";
import { setMyOutsideMessages } from "@/server/actions/post";

/**
 * My post: whether people outside the schools (community accounts) may
 * message the poster through the site. On by default. Their messages come
 * by email with their address to reply to; the poster's own address stays
 * hidden until the poster replies.
 */
export function OutsideMessagesToggle({ accepts }: { accepts: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const set = (next: boolean) =>
    start(async () => {
      setError(null);
      const r = await setMyOutsideMessages(next);
      if (!r.ok) setError(r.error ?? "Couldn’t change that.");
      else router.refresh();
    });

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line bg-paper px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
      <p className={accepts ? "text-ink-2" : "text-ink"}>
        <strong>Messages from people {ACCESS.outside}: {accepts ? "on" : "off"}.</strong>{" "}
        {accepts
          ? "They can't see your contact details, so we email you their message and you reply if you want to."
          : `People ${ACCESS.outside} can't contact you. ${ACCESS.audience} still can.`}
      </p>
      <button
        type="button"
        role="switch"
        aria-checked={accepts}
        className={`${accepts ? "btn-secondary" : "btn-primary"} shrink-0 px-3 py-2 text-sm`}
        disabled={pending}
        onClick={() => set(!accepts)}
      >
        {pending ? "Working…" : accepts ? "Turn off" : "Turn on"}
      </button>
      {error && <p className="text-error-ink">{error}</p>}
    </div>
  );
}
