"use client";

import { Mail } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useState, useTransition } from "react";
import { ACCESS } from "@/config/site";
import { containsLink, LINK_REFUSAL, POSTER_MESSAGE_LIMITS, type RelayStatus } from "@/lib/poster-message";
import { fetchRelayStatus, sendPosterMessageAction } from "@/server/actions/poster-message";

/** Who is writing: a community account, shown so they know what the poster will see. */
export interface RelaySender {
  name: string;
  email: string;
}

const SCAM_NOTE = "Never send money or a deposit before you've seen the place in person and met the poster.";

/**
 * A community account's way to reach a poster: a message the site emails to
 * them, with the sender's name and email so the poster can reply directly.
 * In place of the sign-in prompt in the public listing view. Whether the
 * poster takes these is asked when it opens (fetchRelayStatus), so the public
 * listing never carries it.
 */
export function MessagePoster({ listingId, sender }: { listingId: number; sender: RelaySender }) {
  const [status, setStatus] = useState<RelayStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [pending, start] = useTransition();
  const fieldId = useId();

  useEffect(() => {
    let live = true;
    fetchRelayStatus(listingId)
      .then((s) => live && setStatus(s))
      .catch(() => live && setStatus("unavailable"));
    return () => {
      live = false;
    };
  }, [listingId]);

  const box = "flex flex-col gap-2 rounded-lg border border-notice-line bg-notice-tint p-3 text-sm text-ink";

  if (status === null) return <div className={box} aria-busy="true">Checking whether the poster takes messages…</div>;
  if (status === "not_found") return null;
  if (status === "not_accepting") return <p className={box}>This poster isn&apos;t accepting messages from people {ACCESS.outside}.</p>;
  if (status === "unavailable") return <p className={box}>Messaging posters isn&apos;t available right now. Try again later.</p>;

  if (sent) {
    return (
      <div className={box} role="status">
        <p className="font-bold">Sent. The poster replies to {sender.email}.</p>
        <p className="text-ink-2">{SCAM_NOTE}</p>
      </div>
    );
  }

  if (!open) {
    return (
      <div className={`${box} sm:flex-row sm:items-center sm:justify-between`}>
        <p>Addresses and contact details are for {ACCESS.audience}. You can message the poster through us.</p>
        <button type="button" className="btn-primary inline-flex shrink-0 items-center gap-1.5 px-3 py-2" onClick={() => setOpen(true)}>
          <Mail className="h-4 w-4" aria-hidden /> Message poster
        </button>
      </div>
    );
  }

  const tooLong = body.length > POSTER_MESSAGE_LIMITS.maxChars;
  const send = () => {
    setError(null);
    if (containsLink(body)) return setError(LINK_REFUSAL);
    start(async () => {
      const r = await sendPosterMessageAction({ listingId, body, idempotencyKey: key }).catch(() => ({ ok: false as const, error: "Your message didn't go through. Try again." }));
      if (r.ok) setSent(true);
      else {
        setError(r.error);
        // A failed send keeps its key on the server; a fresh key lets the next press try again.
        if (!r.error.includes("still sending")) setKey(crypto.randomUUID());
      }
    });
  };

  return (
    <form
      className={box}
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <label htmlFor={fieldId} className="font-bold">
        Message the poster
      </label>
      <p className="text-ink-2">
        We email it to them from {sender.name} ({sender.email}), labelled as from someone {ACCESS.outside}. They reply to your email directly. No links, please.
      </p>
      <textarea
        id={fieldId}
        className="field min-h-36"
        rows={6}
        value={body}
        maxLength={POSTER_MESSAGE_LIMITS.maxChars + 200}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Hi! I'm looking for a place from January to May. Is the room still free, and could I see it?"
        aria-describedby={`${fieldId}-count`}
        required
      />
      <p id={`${fieldId}-count`} className={`text-xs ${tooLong ? "text-error-ink" : "text-ink-3"}`}>
        {body.trim().length} / {POSTER_MESSAGE_LIMITS.maxChars}
      </p>
      <p className="text-ink-2">{SCAM_NOTE}</p>
      {error && (
        <p role="alert" className="text-error-ink">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn-primary px-3 py-2" disabled={pending || tooLong || body.trim().length < POSTER_MESSAGE_LIMITS.minChars}>
          {pending ? "Sending…" : "Send message"}
        </button>
        <button type="button" className="link" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </button>
        <Link href="/account" className="link ml-auto text-xs text-ink-3">
          Not your name?
        </Link>
      </div>
    </form>
  );
}
