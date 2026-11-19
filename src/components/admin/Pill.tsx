import type { ReactNode } from "react";

export type PillTone = "good" | "warn" | "bad" | "info" | "muted";

const TONE: Record<PillTone, string> = {
  good: "bg-included-tint text-included-ink",
  warn: "bg-tenant-tint text-tenant-ink",
  bad: "bg-error-tint text-error-ink",
  info: "bg-notice-tint text-notice-ink",
  muted: "bg-line-light text-ink-2",
};

/** A status as a small pill. `dot` marks something that needs a look. */
export function Pill({ tone = "muted", dot = false, title, children }: { tone?: PillTone; dot?: boolean; title?: string; children: ReactNode }) {
  return (
    <span title={title} className={`inline-flex h-5 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] font-bold whitespace-nowrap ${TONE[tone]}`}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-maple" aria-hidden />}
      {children}
    </span>
  );
}

/** A count on a tab or a heading: something is waiting. */
export function CountBadge({ n, label }: { n: number; label?: string }) {
  if (n <= 0) return null;
  return (
    <span className="grid h-4 min-w-4 place-items-center rounded-full bg-maple px-1 text-[11px] leading-none font-bold text-paper" aria-label={label ? `${n} ${label}` : undefined}>
      {n}
    </span>
  );
}
