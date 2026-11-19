import type { ReactNode } from "react";
import { Tip } from "./Tip";
import { CARD, CARD_TITLE } from "./ui";

/**
 * The admin's unit of layout: a titled card. What the title needs explaining
 * goes in `tip` (behind an ⓘ), never under it; `actions` sit at its right
 * (a CSV button, a link). `flush` drops the body's side padding for a list
 * or table that runs edge to edge.
 */
export function Card({ title, tip, actions, children, id, flush = false, className = "" }: { title?: string; tip?: string; actions?: ReactNode; children: ReactNode; id?: string; flush?: boolean; className?: string }) {
  const heading = title ? (
    <h2 id={id ? `${id}-h` : undefined} className={CARD_TITLE}>
      {tip ? <Tip text={tip}>{title}</Tip> : title}
    </h2>
  ) : null;
  return (
    <section id={id} aria-labelledby={id && title ? `${id}-h` : undefined} className={`${CARD} flex min-w-0 flex-col ${className}`}>
      {(title || actions) && (
        <div className="flex min-h-12 items-center justify-between gap-3 px-4 pt-1">
          {heading}
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={`flex min-w-0 flex-col gap-3 pb-4 ${title || actions ? "" : "pt-4"} ${flush ? "" : "px-4"}`}>{children}</div>
    </section>
  );
}

/** A line of muted text for an empty card ("Nothing needs a look."). */
export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-[13px] text-ink-3">{children}</p>;
}
