import type { ReactNode } from "react";

/**
 * The top of every admin page: its one title, then Find and (on pages whose
 * numbers follow it) the date range, on one line. On a phone the range drops
 * to its own full-width row.
 */
export function PageHeader({ title, find, range }: { title: string; find: ReactNode; range?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-center gap-x-2 gap-y-3">
      <h1 className="mr-auto text-xl leading-7 font-bold">{title}</h1>
      {find}
      {range && <div className="w-full md:w-auto">{range}</div>}
    </header>
  );
}
