"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { focusFirstInvalid } from "@/components/form-errors";
import { ACCESS_REQUEST_LIMITS, type AccessRequestKind, parseAccessRequest } from "@/lib/access-request";
import { type AccessRequestState, requestAccessAction } from "@/server/actions/access-request";

const KINDS: { value: AccessRequestKind; label: string; hint: string }[] = [
  { value: "school", label: "Request your school", hint: "Tell us which school and we'll look at opening it up." },
  { value: "access", label: "Request access", hint: "For people without a student address who still have a good reason." },
];

/** Front-page request: which kind, who, a reply address, and a few words. */
export function RequestForm({ initialKind }: { initialKind: AccessRequestKind }) {
  const [state, action, pending] = useActionState<AccessRequestState, FormData>(requestAccessAction, { ok: false });
  const [kind, setKind] = useState<AccessRequestKind>(initialKind);
  // A refusal found in the browser with the same schema, shown until the next submit.
  const [refused, setRefused] = useState<{ error: string; fieldErrors: Record<string, string> } | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const err = (refused ?? state).fieldErrors ?? {};
  const topError = refused ? refused.error : state.error;

  useEffect(() => {
    if (state.error) focusFirstInvalid(form.current);
  }, [state]);
  useEffect(() => {
    if (refused) focusFirstInvalid(form.current);
  }, [refused]);

  if (state.ok) {
    return (
      <div role="status" className="rounded-2xl border border-included-line bg-included-tint p-5 text-included-ink">
        <p className="font-bold">Thanks, it&apos;s on its way.</p>
        <p className="mt-1 text-sm">A person reads every request. Expect a reply by email within a few days.</p>
      </div>
    );
  }

  return (
    <form
      ref={form}
      className="flex flex-col gap-5 rounded-2xl border border-line bg-paper p-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        const check = parseAccessRequest(data);
        // The honeypot goes to the server like anything else; it answers with a quiet thanks.
        if (!check.ok && !check.fieldErrors.website) {
          setRefused({ error: "Check the fields marked below.", fieldErrors: check.fieldErrors });
          return;
        }
        setRefused(null);
        startTransition(() => action(data));
      }}
    >
      {topError && (
        <p role="alert" className="rounded-lg border border-error-line bg-error-tint px-3 py-2 text-sm text-error-ink">
          {topError}
        </p>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-bold">What are you asking for?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {KINDS.map((k) => (
            <label
              key={k.value}
              className={`flex cursor-pointer flex-col gap-0.5 rounded-xl border px-3 py-2.5 ${kind === k.value ? "border-lake bg-notice-tint" : "border-line"}`}
            >
              <span className="flex items-center gap-2 font-bold">
                <input type="radio" name="kind" value={k.value} checked={kind === k.value} onChange={() => setKind(k.value)} className="h-4 w-4 accent-lake" />
                {k.label}
              </span>
              <span className="text-xs text-ink-2">{k.hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your name" error={err.name}>
          <input name="name" type="text" autoComplete="name" aria-invalid={err.name ? true : undefined} maxLength={ACCESS_REQUEST_LIMITS.name} className="field" required />
        </Field>
        <Field label="Email for our reply" error={err.email}>
          <input name="email" type="email" autoComplete="email" aria-invalid={err.email ? true : undefined} maxLength={ACCESS_REQUEST_LIMITS.email} className="field" required />
        </Field>
      </div>

      <Field label={kind === "school" ? "Your school" : "School or connection (optional)"} error={err.school}>
        <input
          name="school"
          type="text"
          aria-invalid={err.school ? true : undefined}
          maxLength={ACCESS_REQUEST_LIMITS.school}
          className="field"
          placeholder={kind === "school" ? "e.g. Champlain College" : "e.g. class of 2025"}
          required={kind === "school"}
        />
      </Field>

      <Field label={kind === "school" ? "Anything else (optional)" : "Why you'd like access"} error={err.message}>
        <textarea
          name="message"
          rows={4}
          aria-invalid={err.message ? true : undefined}
          maxLength={ACCESS_REQUEST_LIMITS.message}
          className="field"
          placeholder={kind === "school" ? "" : "I graduated in May and I'm subletting my room until the lease ends…"}
          required={kind === "access"}
        />
      </Field>

      {/* Hidden from people; bots fill it in. */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Website
          <input name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>

      <button type="submit" className="btn-primary self-start px-5 py-3" disabled={pending} aria-busy={pending}>
        {pending ? "Sending…" : "Send request"}
      </button>
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-bold">{label}</span>
      {children}
      {error && <span className="text-sm text-error-ink">{error}</span>}
    </label>
  );
}
