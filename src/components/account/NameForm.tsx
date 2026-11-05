"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { focusFirstInvalid } from "@/components/form-errors";
import { checkName, NAME_MAX } from "@/lib/person-name";
import { type NameState, saveNameAction } from "@/server/actions/account";

type Refusal = { error: string; fieldErrors: { first?: string; last?: string } };

/**
 * First and last name. Checked in the browser with the server's rules first;
 * either refusal puts the cursor in the first field that needs fixing, with
 * its message under it, and what was typed stays.
 */
export function NameForm({ initial, next, submitLabel }: { initial: { first: string; last: string }; next: string; submitLabel: string }) {
  const [state, action, pending] = useActionState<NameState, FormData>(saveNameAction, { ok: true });
  const [refused, setRefused] = useState<Refusal | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const shown = refused ?? state;

  useEffect(() => {
    if (state.error) focusFirstInvalid(form.current);
  }, [state]);
  useEffect(() => {
    if (refused) focusFirstInvalid(form.current);
  }, [refused]);

  const field = (name: "first" | "last", label: string, autoComplete: string) => {
    const error = shown.fieldErrors?.[name];
    return (
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-bold text-ink">{label}</span>
        <input
          type="text"
          name={name}
          defaultValue={initial[name]}
          autoComplete={autoComplete}
          maxLength={NAME_MAX}
          className={`field ${error ? "border-error-line" : ""}`}
          aria-invalid={error ? true : undefined}
          required
        />
        {error && <span className="text-xs text-error-ink">{error}</span>}
      </label>
    );
  };
  return (
    <form
      ref={form}
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        const first = checkName(data.get("first"), "first name");
        const last = checkName(data.get("last"), "last name");
        if (!first.ok || !last.ok) {
          setRefused({ error: "Check the fields marked below.", fieldErrors: { first: first.ok ? undefined : first.error, last: last.ok ? undefined : last.error } });
          return;
        }
        setRefused(null);
        startTransition(() => action(data));
      }}
    >
      <input type="hidden" name="next" value={next} />
      <div className="grid gap-4 sm:grid-cols-2">
        {field("first", "First name", "given-name")}
        {field("last", "Last name", "family-name")}
      </div>
      {shown.error && (
        <p role="alert" className="rounded-lg border border-error-line bg-error-tint px-3 py-2 text-sm text-error-ink">
          {shown.error}
        </p>
      )}
      <button type="submit" className="btn-primary self-start" disabled={pending} aria-busy={pending}>
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
