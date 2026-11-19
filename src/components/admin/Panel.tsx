import type { ReactNode } from "react";

/** A titled card: the admin's unit of layout. `actions` sit at the right of the title (a CSV button). */
export function Panel({ title, hint, actions, children, id }: { title: string; hint?: ReactNode; actions?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-h` : undefined} className="flex min-w-0 flex-col gap-3 rounded-xl border border-line bg-paper p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 id={id ? `${id}-h` : undefined} className="font-bold">
            {title}
          </h3>
          {hint && <p className="text-sm text-ink-3">{hint}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

/** A table that scrolls sideways inside its card on a phone instead of pushing the page wider. */
export function ScrollTable({ children }: { children: ReactNode }) {
  return <div className="-mx-4 overflow-x-auto px-4">{children}</div>;
}
