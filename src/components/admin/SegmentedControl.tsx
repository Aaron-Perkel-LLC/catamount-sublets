import Link from "next/link";
import type { ReactNode } from "react";

/** One segment's look, for anything that sits in a SegmentedControl but isn't a plain option (the range's Custom button). */
export function segmentClass(on: boolean): string {
  return `inline-flex h-11 flex-auto items-center justify-center rounded-md px-1.5 text-[13px] whitespace-nowrap md:h-7 md:flex-none md:px-2.5 ${on ? "bg-lake font-bold text-paper" : "text-ink-2 hover:bg-paper hover:text-ink"}`;
}

export interface Segment<K extends string> {
  key: K;
  label: string;
  /** A link; without it the segment is a button and `onPick` is called. */
  href?: string;
}

/**
 * A compact one-of-several control: 28 px tall with a pointer, 44 px and
 * full width on a phone. Segments are links (the date range, which lives in
 * the URL) or buttons (a table's filter). `children` are extra segments
 * after the options.
 */
export function SegmentedControl<K extends string>({ label, segments, value, onPick, children, className = "" }: { label: string; segments: readonly Segment<K>[]; value: K | null; onPick?: (key: K) => void; children?: ReactNode; className?: string }) {
  return (
    <div role="group" aria-label={label} className={`relative flex items-center gap-0.5 rounded-lg bg-line-light/80 p-0.5 ${className}`}>
      {segments.map((s) =>
        s.href ? (
          <Link key={s.key} href={s.href} scroll={false} aria-current={value === s.key ? "true" : undefined} className={segmentClass(value === s.key)}>
            {s.label}
          </Link>
        ) : (
          <button key={s.key} type="button" aria-pressed={value === s.key} onClick={() => onPick?.(s.key)} className={segmentClass(value === s.key)}>
            {s.label}
          </button>
        ),
      )}
      {children}
    </div>
  );
}
