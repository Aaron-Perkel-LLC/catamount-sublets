"use client";

import { useState, useTransition } from "react";
import { EMAIL_ANSWER_VALUES, EMAIL_ANSWERS, type EmailAnswer } from "@/lib/listing-outcome";
import { answerOutcomeAction } from "@/server/actions/outcome";
import type { ListingEffect } from "@/server/services/listing-outcome";

const EFFECT_TEXT: Record<ListingEffect, string> = {
  taken: "Your listing is marked as taken and is off the board. Changed your mind? Put it back up from My post.",
  reopened: "Your listing is back on the board, marked as confirmed available today.",
  confirmed: "Your listing now shows that you confirmed it's available today.",
  unchanged: "",
  gone: "Your listing has already come down, so this only records your answer.",
};

/**
 * The email's answer, recorded (and acted on: taken, confirmed) only when the
 * poster taps a button here. Opening the page records nothing: mail scanners
 * open every link in a message, and some (Microsoft Safe Links) run the
 * page's JavaScript in a sandbox, so neither the GET nor anything that runs
 * on load may write. The button tapped in the email (`chosen`, from ?a=) is
 * only highlighted with "Tap to confirm"; the POST is the confirming tap.
 */
export function OutcomeAnswer({ token, chosen, current }: { token: string; chosen: EmailAnswer | null; current: EmailAnswer | null }) {
  const [recorded, setRecorded] = useState<EmailAnswer | null>(null);
  const [effect, setEffect] = useState<ListingEffect | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const answer = (a: EmailAnswer) =>
    start(async () => {
      setError(null);
      const r = await answerOutcomeAction(token, a);
      if (r.ok) {
        setRecorded(r.outcome);
        setEffect(r.effect);
      }
      else setError(r.error);
    });

  // Nothing is posted on arrival (see above): ?a= only pre-selects, until the poster confirms or picks another.
  const saved = recorded ?? current;
  const toConfirm = !recorded && chosen && chosen !== current ? chosen : null;
  const highlighted = recorded ?? toConfirm ?? current;
  return (
    <div className="flex flex-col gap-4">
      <div role="status" aria-live="polite" className="min-h-14">
        {recorded ? (
          <div className="rounded-2xl border border-included-line bg-included-tint p-4 text-included-ink">
            <p className="font-bold">Thanks. Recorded: {EMAIL_ANSWERS[recorded]}.</p>
            {effect && EFFECT_TEXT[effect] && <p className="mt-1 text-sm">{EFFECT_TEXT[effect]}</p>}
            <p className="mt-1 text-sm">Tapped the wrong one? Pick another below and it replaces this.</p>
          </div>
        ) : pending ? (
          <p className="text-ink-2">Recording your answer…</p>
        ) : toConfirm ? (
          <div className="text-ink-2">
            <p className="font-bold text-ink">Tap &ldquo;{EMAIL_ANSWERS[toConfirm]}&rdquo; to confirm.</p>
            <p className="mt-1 text-sm">
              Nothing is recorded until you do.
              {current && <> Your answer so far: {EMAIL_ANSWERS[current]}.</>}
            </p>
          </div>
        ) : saved ? (
          <p className="text-ink-2">Your answer so far: {EMAIL_ANSWERS[saved]}. Pick another to change it.</p>
        ) : (
          <p className="text-ink-2">Pick the one that fits.</p>
        )}
        {error && (
          <p role="alert" className="mt-2 text-sm text-error-ink">
            {error}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {EMAIL_ANSWER_VALUES.map((a) => (
          <button key={a} type="button" disabled={pending} aria-pressed={saved === a} className={highlighted === a ? "btn-primary" : "btn-secondary"} onClick={() => answer(a)}>
            {EMAIL_ANSWERS[a]}
          </button>
        ))}
      </div>
    </div>
  );
}
