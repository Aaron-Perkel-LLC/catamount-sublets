"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { RANGE_KEYS, RANGE_LABELS, type RangeKey } from "@/lib/admin-range";
import { dayLabel } from "@/lib/chart";

export interface RangeDto {
  key: RangeKey;
  label: string;
  from: string;
  to: string;
  prev: { from: string; to: string } | null;
}

/**
 * The one date range every admin number reads, kept in the URL (?range=)
 * so it survives a reload and goes with a link. Pills scroll sideways on a
 * phone; Custom opens two date fields.
 */
export function RangePicker({ range }: { range: RangeDto }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [custom, setCustom] = useState(range.key === "custom");
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);

  const go = (key: RangeKey, dates?: { from: string; to: string }) => {
    const q = new URLSearchParams(params.toString());
    q.set("range", key);
    q.delete("from");
    q.delete("to");
    if (dates) {
      q.set("from", dates.from);
      q.set("to", dates.to);
    }
    router.push(`${pathname}?${q.toString()}`, { scroll: false });
  };

  const span = (a: string, b: string) => (a === b ? dayLabel(a) : `${dayLabel(a)} – ${dayLabel(b)}`);

  return (
    <div className="flex flex-col gap-2">
      <nav aria-label="Date range" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <ul className="flex w-max gap-1.5 md:w-auto md:flex-wrap">
          {RANGE_KEYS.map((k) => {
            const on = k === "custom" ? custom : range.key === k && !custom;
            return (
              <li key={k}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => (k === "custom" ? setCustom(true) : (setCustom(false), go(k)))}
                  className={`min-h-10 rounded-full border px-3.5 text-sm whitespace-nowrap ${on ? "border-lake bg-lake text-paper" : "border-line bg-paper text-ink-2 hover:text-lake"}`}
                >
                  {RANGE_LABELS[k]}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
      {custom && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (from && to && from <= to) go("custom", { from, to });
          }}
        >
          <label className="flex flex-col gap-1 text-xs text-ink-3">
            From
            <input type="date" className="field" value={from} max={to} onChange={(e) => setFrom(e.target.value)} required />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-3">
            To
            <input type="date" className="field" value={to} min={from} onChange={(e) => setTo(e.target.value)} required />
          </label>
          <button type="submit" className="btn-secondary min-h-10">
            Apply
          </button>
        </form>
      )}
      <p className="text-xs text-ink-3">
        {span(range.from, range.to)} (Eastern){range.prev ? `, compared with ${span(range.prev.from, range.prev.to)}` : ", nothing before to compare with"}
      </p>
    </div>
  );
}
