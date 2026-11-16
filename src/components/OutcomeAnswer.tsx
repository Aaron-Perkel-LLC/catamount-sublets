"use client";

import { useEffect, useRef, useState, useTransition } from "react";
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
 * The email's answer, recorded (and acted on: taken, confirmed) by a POST
 * from this page rather than by opening the link: mail scanners open every
 * link in a message, and a GET that wrote would act on answers nobody gave. To the poster it is still
 * one tap: the page opens, says what it recorded, and offers the others.
 */
export function OutcomeAnswer({ token, chosen, current }: { token: string; chosen: EmailAnswer | null; current: EmailAnswer | null }) {
  const [recorded, setRecorded] = useState<EmailAnswer | null>(null);
  const [effect, setEffect] = useState<ListingEffect | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const sentFirst = useRef(false);

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

  useEffect(() => {
    if (!chosen || sentFirst.current) return;
    sentFirst.current = true;
    answer(chosen);
    // Once, on arrival, with the button the poster tapped in the email.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shown = recorded ?? (chosen ? null : current);
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
        ) : shown ? (
          <p className="text-ink-2">Your answer so far: {EMAIL_ANSWERS[shown]}. Pick another to change it.</p>
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
          <button key={a} type="button" disabled={pending} aria-pressed={(recorded ?? shown) === a} className={(recorded ?? shown) === a ? "btn-primary" : "btn-secondary"} onClick={() => answer(a)}>
            {EMAIL_ANSWERS[a]}
          </button>
        ))}
      </div>
    </div>
  );
}
