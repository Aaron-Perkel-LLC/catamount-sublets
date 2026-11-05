"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { focusFirstInvalid } from "@/components/form-errors";
import { SITE } from "@/config/site";
import { SURVEY_LIMITS, SURVEY_QUESTIONS, type SurveyAnswers, type SurveyUsed, parseSurvey, skipsUsageQuestions } from "@/lib/survey";
import { type SurveyState, submitSurveyAction } from "@/server/actions/survey";

const AUTHOR = SITE.author.split(" ")[0];

/**
 * The feedback survey. Answers are checked in the browser with the same
 * schema the action uses, then sent with the link's token. Someone who has
 * not used the site yet is not shown the questions about using it (the
 * server drops those answers too). Filled in again from `initial` for a
 * second visit, and a save then replaces the earlier answers.
 */
export function SurveyForm({ token, initial, answeredOn }: { token: string; initial: SurveyAnswers | null; answeredOn: string | null }) {
  const [state, action, pending] = useActionState<SurveyState, FormData>(submitSurveyAction, { ok: false });
  const [used, setUsed] = useState<SurveyUsed | "">(initial?.used ?? "");
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
        <p className="font-bold">Thanks, that&apos;s everything.</p>
        <p className="mt-1 text-sm">
          {state.replaced ? "Your earlier answers were replaced. " : ""}
          If you ticked the follow-up box, {AUTHOR} may reply by email.
        </p>
      </div>
    );
  }

  const skip = skipsUsageQuestions(used);
  let count = 0;
  const number = () => String(++count).padStart(2, "0");

  return (
    <form
      ref={form}
      className="flex flex-col gap-6"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        const check = parseSurvey(data);
        // The honeypot goes to the server like anything else; it answers with a quiet thanks.
        if (!check.ok && !check.fieldErrors.website) {
          setRefused({ error: "Check the answers marked below.", fieldErrors: check.fieldErrors });
          return;
        }
        setRefused(null);
        startTransition(() => action(data));
      }}
    >
      <input type="hidden" name="t" value={token} />

      {answeredOn && (
        <p className="rounded-lg border border-line bg-notice-tint px-3 py-2 text-sm text-ink-2">
          You answered on {answeredOn}. Change anything below and send it again.
        </p>
      )}
      {topError && (
        <p role="alert" className="rounded-lg border border-error-line bg-error-tint px-3 py-2 text-sm text-error-ink">
          {topError}
        </p>
      )}

      <Choices
        name="used"
        number={number()}
        label={SURVEY_QUESTIONS.used.label}
        options={SURVEY_QUESTIONS.used.options}
        required
        error={err.used}
        selected={used}
        onSelect={(v) => setUsed(v as SurveyUsed)}
      />

      {!skip && (
        <Choices name="outcome" number={number()} label={SURVEY_QUESTIONS.outcome.label} options={SURVEY_QUESTIONS.outcome.options} error={err.outcome} initial={initial?.outcome ? [initial.outcome] : []} />
      )}

      <Scale name="overall" number={number()} label={SURVEY_QUESTIONS.overall.label} ends={SURVEY_QUESTIONS.overall.ends} required error={err.overall} initial={initial?.overall ?? null} />

      {!skip && (
        <>
          <Choices
            name="useful"
            number={number()}
            label={SURVEY_QUESTIONS.useful.label}
            help={SURVEY_QUESTIONS.useful.help}
            options={SURVEY_QUESTIONS.useful.options}
            multiple
            error={err.useful}
            initial={initial?.useful ?? []}
          />
          <Choices name="signin" number={number()} label={SURVEY_QUESTIONS.signin.label} options={SURVEY_QUESTIONS.signin.options} error={err.signin} initial={initial?.signin ? [initial.signin] : []} />
          <Choices name="vsLegacy" number={number()} label={SURVEY_QUESTIONS.vsLegacy.label} options={SURVEY_QUESTIONS.vsLegacy.options} error={err.vsLegacy} initial={initial?.vsLegacy ? [initial.vsLegacy] : []} />
        </>
      )}

      <FreeText name="problems" number={number()} label={SURVEY_QUESTIONS.problems.label} error={err.problems} initial={initial?.problems ?? ""} />
      <FreeText name="missing" number={number()} label={SURVEY_QUESTIONS.missing.label} error={err.missing} initial={initial?.missing ?? ""} />

      <Scale name="recommend" number={number()} label={SURVEY_QUESTIONS.recommend.label} ends={SURVEY_QUESTIONS.recommend.ends} error={err.recommend} initial={initial?.recommend ?? null} />

      <section className="flex flex-col gap-4 border-t border-line pt-6">
        <h2 className="text-lg font-bold">{SURVEY_QUESTIONS.lejer.section}</h2>
        <p className="text-sm text-ink-2">{SURVEY_QUESTIONS.lejer.intro}</p>
        <Choices name="lejer" number={number()} label={SURVEY_QUESTIONS.lejer.label} options={SURVEY_QUESTIONS.lejer.options} error={err.lejer} initial={initial?.lejer ? [initial.lejer] : []} />
      </section>

      <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-line px-3 py-2.5 has-checked:border-lake has-checked:bg-notice-tint">
        <input type="checkbox" name="followup" defaultChecked={initial?.followup ?? false} className="h-4 w-4 accent-lake" />
        <span className="text-sm font-bold">{SURVEY_QUESTIONS.followup.label}</span>
      </label>

      {/* Hidden from people; bots fill it in. */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Website
          <input name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>

      <button type="submit" className="btn-primary self-start px-5 py-3" disabled={pending} aria-busy={pending}>
        {pending ? "Sending…" : answeredOn ? "Send again" : "Send answers"}
      </button>
    </form>
  );
}

function Legend({ number, label, required, help, error, id }: { number: string; label: string; required?: boolean; help?: string; error?: string; id: string }) {
  return (
    <>
      <legend className="mb-2 flex gap-2 text-sm font-bold">
        <span className="tabular-nums text-ink-3">{number}</span>
        <span>
          {label}
          {required && <span className="ml-2 rounded-full bg-notice-tint px-2 py-0.5 text-xs font-bold text-lake">required</span>}
        </span>
      </legend>
      {help && <p className="mb-2 text-xs text-ink-3">{help}</p>}
      {error && (
        <p id={id} className="mb-2 text-sm text-error-ink">
          {error}
        </p>
      )}
    </>
  );
}

/** Radio or checkbox cards. Controlled through `selected`/`onSelect` (the branching question), otherwise filled in from `initial`. */
function Choices({
  name,
  number,
  label,
  help,
  options,
  required,
  multiple,
  error,
  initial = [],
  selected,
  onSelect,
}: {
  name: string;
  number: string;
  label: string;
  help?: string;
  options: Readonly<Record<string, string>>;
  required?: boolean;
  multiple?: boolean;
  error?: string;
  initial?: readonly string[];
  selected?: string;
  onSelect?: (value: string) => void;
}) {
  const errorId = `${name}-error`;
  return (
    <fieldset aria-describedby={error ? errorId : undefined}>
      <Legend number={number} label={label} required={required} help={help} error={error} id={errorId} />
      <div className="grid gap-2 sm:grid-cols-2">
        {Object.entries(options).map(([value, text], i) => (
          <label key={value} className="flex cursor-pointer items-center gap-2 rounded-xl border border-line px-3 py-2.5 has-checked:border-lake has-checked:bg-notice-tint">
            <input
              type={multiple ? "checkbox" : "radio"}
              name={name}
              value={value}
              className="h-4 w-4 shrink-0 accent-lake"
              aria-invalid={error && i === 0 ? true : undefined}
              {...(onSelect ? { checked: selected === value, onChange: () => onSelect(value) } : { defaultChecked: initial.includes(value) })}
            />
            <span className="text-sm">{text}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Five points in a row, with what the ends mean. */
function Scale({ name, number, label, ends, required, error, initial }: { name: string; number: string; label: string; ends: readonly [string, string]; required?: boolean; error?: string; initial: number | null }) {
  const errorId = `${name}-error`;
  return (
    <fieldset aria-describedby={error ? errorId : undefined}>
      <Legend number={number} label={label} required={required} error={error} id={errorId} />
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((point) => (
          <label key={point} className="flex flex-1 cursor-pointer flex-col items-center gap-1 rounded-xl border border-line py-2.5 has-checked:border-lake has-checked:bg-notice-tint">
            <input type="radio" name={name} value={point} defaultChecked={initial === point} className="h-4 w-4 accent-lake" aria-invalid={error && point === 1 ? true : undefined} />
            <span className="text-sm font-bold">{point}</span>
          </label>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-xs text-ink-3" aria-hidden>
        <span>1 · {ends[0]}</span>
        <span>{ends[1]} · 5</span>
      </div>
      <p className="sr-only">
        1 means {ends[0]}, 5 means {ends[1]}.
      </p>
    </fieldset>
  );
}

function FreeText({ name, number, label, error, initial }: { name: string; number: string; label: string; error?: string; initial: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex gap-2 text-sm font-bold">
        <span className="tabular-nums text-ink-3">{number}</span>
        <span>{label}</span>
      </span>
      <textarea name={name} rows={3} maxLength={SURVEY_LIMITS.text} defaultValue={initial} aria-invalid={error ? true : undefined} className="field" placeholder="Optional" />
      {error && <span className="text-sm text-error-ink">{error}</span>}
    </label>
  );
}
