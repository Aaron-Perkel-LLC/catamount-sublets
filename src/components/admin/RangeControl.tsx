"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { RangeKey, ResolvedRange } from "@/lib/admin-range";
import { SegmentedControl, segmentClass } from "./SegmentedControl";
import { BTN_PRIMARY, FIELD, FIELD_LABEL } from "./ui";

const PRESETS: { key: RangeKey; label: string }[] = [
  { key: "7d", label: "7d" },
  { key: "30d", label: "30d" },
  { key: "semester", label: "Semester" },
  { key: "cutover", label: "Cutover" },
  { key: "all", label: "All" },
];

/**
 * The one date range every admin number reads, kept in the URL (?range=) so
 * it survives a reload and goes with a link: a segmented control in the page
 * header. Custom opens two date fields under it.
 */
export function RangeControl({ range, pathname, params }: { range: Pick<ResolvedRange, "key" | "from" | "to">; pathname: string; params: URLSearchParams }) {
  const router = useRouter();
  const wrap = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);

  const href = (key: RangeKey, dates?: { from: string; to: string }) => {
    const q = new URLSearchParams(params.toString());
    q.set("range", key);
    q.delete("from");
    q.delete("to");
    if (dates) {
      q.set("from", dates.from);
      q.set("to", dates.to);
    }
    return `${pathname}?${q.toString()}`;
  };

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div ref={wrap} className="relative">
      <SegmentedControl label="Date range" value={range.key === "custom" ? null : range.key} segments={PRESETS.map((p) => ({ ...p, href: href(p.key) }))}>
        <button
          type="button"
          aria-expanded={open}
          aria-pressed={range.key === "custom"}
          onClick={() => {
            setFrom(range.from);
            setTo(range.to);
            setOpen((o) => !o);
          }}
          className={segmentClass(range.key === "custom")}
        >
          Custom
        </button>
      </SegmentedControl>
      {open && (
        <form
          className="absolute top-full right-0 z-30 mt-2 flex w-72 max-w-[calc(100vw-2rem)] flex-col gap-3 rounded-xl border border-line bg-paper p-4 shadow-lg"
          onSubmit={(e) => {
            e.preventDefault();
            if (!from || !to || from > to) return;
            setOpen(false);
            router.push(href("custom", { from, to }), { scroll: false });
          }}
        >
          <label className={FIELD_LABEL}>
            From
            <input type="date" className={FIELD} value={from} max={to} onChange={(e) => setFrom(e.target.value)} required />
          </label>
          <label className={FIELD_LABEL}>
            To
            <input type="date" className={FIELD} value={to} min={from} onChange={(e) => setTo(e.target.value)} required />
          </label>
          <button type="submit" className={BTN_PRIMARY}>
            Apply
          </button>
        </form>
      )}
    </div>
  );
}
