"use client";

import { useState } from "react";
import { semesterKey } from "@/lib/semesters";

export interface SemesterPill {
  code: string;
  name: string;
  /** False for a closed semester the listing already has (kept, labelled). */
  active: boolean;
}

/**
 * Pills, one per semester the listing may run for. Ticking several is
 * allowed only back to back (Summer and Fall; Fall and the next Spring), so
 * whatever would leave a gap is greyed out with aria-disabled rather than
 * disabled — ticked boxes must still be submitted. The server checks the
 * same rule.
 */
export function SemesterPicker({ options, initial, error }: { options: SemesterPill[]; initial: string[]; error?: string }) {
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(initial));
  const keys = new Map(options.map((o) => [o.code, semesterKey(o.name)]));
  const chosenKeys = [...chosen].map((c) => keys.get(c));
  const anyKeyless = chosenKeys.some((k) => k === null || k === undefined);
  const nums = chosenKeys.filter((k): k is number => typeof k === "number");
  const min = nums.length ? Math.min(...nums) : null;
  const max = nums.length ? Math.max(...nums) : null;

  const available = (code: string): boolean => {
    const key = keys.get(code) ?? null;
    if (chosen.has(code)) {
      // Can untick only the only one, or an end of the run.
      if (chosen.size === 1) return true;
      if (anyKeyless || key === null) return false;
      return key === min || key === max;
    }
    if (chosen.size === 0) return true;
    if (anyKeyless || key === null) return false;
    return key === min! - 1 || key === max! + 1;
  };

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-bold">Semester</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = chosen.has(o.code);
          const ok = available(o.code);
          return (
            <label
              key={o.code}
              className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${on ? "border-lake bg-lake text-paper" : "border-line bg-paper"} ${ok ? "" : "cursor-not-allowed opacity-50"} ${o.active ? "" : "italic"}`}
              aria-disabled={!ok}
            >
              <input
                type="checkbox"
                name="semesters"
                value={o.code}
                aria-invalid={error ? true : undefined}
                checked={on}
                className="sr-only"
                onChange={() => {
                  if (!ok) return;
                  const next = new Set(chosen);
                  if (on) next.delete(o.code);
                  else next.add(o.code);
                  setChosen(next);
                }}
                onClick={(e) => {
                  if (!ok) e.preventDefault();
                }}
              />
              {o.name}
              {!o.active && <span className="text-xs">(closed)</span>}
            </label>
          );
        })}
      </div>
      <p className="text-xs text-ink-3">
        Pick more than one if it&apos;s available back to back, like Summer and Fall. For a later semester with a gap, post again
        once this sublet is over.
      </p>
      {error && <p className="text-sm text-error-ink">{error}</p>}
    </fieldset>
  );
}
