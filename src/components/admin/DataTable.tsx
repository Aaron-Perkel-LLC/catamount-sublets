import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";
import { Empty } from "./Card";
import type { SortDir, SortState } from "./sort";
import { num, ZERO } from "./ui";

export interface Column<T, K extends string = string> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** A number: right-aligned, tabular figures. */
  numeric?: boolean;
  /** The row's name: its first line, unlabelled, on a phone. */
  primary?: boolean;
  /** No label on a phone either (a row of actions, a note that explains itself). */
  bare?: boolean;
  /** Only from 1024 px up as a column; a phone's card still shows it. */
  wide?: boolean;
  /** Sortable under this key (the parent holds the sort: useSort.ts). */
  sort?: K;
  firstDir?: SortDir;
  className?: string;
}

/**
 * The admin's one table: a quiet header, hairline rows, numbers
 * right-aligned in tabular figures, and on a phone a card per row with each
 * cell as a labelled line (the CSS is `.admin-table` in globals.css, so the
 * markup and any state inside a cell exist once). A cell that renders
 * nothing takes no line on a phone. Meant to sit flush inside a Card.
 */
export function DataTable<T, K extends string = string>({
  columns,
  rows,
  rowKey,
  sort,
  onSort,
  empty = "Nothing here.",
  rowProps,
  label,
}: {
  columns: Column<T, K>[];
  rows: readonly T[];
  rowKey: (row: T) => string | number;
  sort?: SortState<K>;
  onSort?: (key: K, firstDir: SortDir) => void;
  empty?: string;
  rowProps?: (row: T) => HTMLAttributes<HTMLTableRowElement> & { [data: `data-${string}`]: string | undefined };
  /** What the table lists, for a screen reader. */
  label?: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="px-4">
        <Empty>{empty}</Empty>
      </div>
    );
  }
  const wide = (c: Column<T, K>) => (c.wide ? "md:max-lg:hidden" : "");
  return (
    <div className="overflow-x-auto">
      <table className="admin-table" aria-label={label}>
        <thead>
          <tr>
            {columns.map((c) => {
              const active = Boolean(c.sort && sort?.key === c.sort);
              const Icon = !active ? ArrowUpDown : sort?.dir === "asc" ? ArrowUp : ArrowDown;
              return (
                <th key={c.key} scope="col" aria-sort={c.sort ? (active ? (sort?.dir === "asc" ? "ascending" : "descending") : "none") : undefined} className={`${c.numeric ? "num" : ""} ${wide(c)}`}>
                  {c.sort && onSort ? (
                    <button type="button" onClick={() => onSort(c.sort as K, c.firstDir ?? (c.numeric ? "desc" : "asc"))} className={`inline-flex items-center gap-1 text-xs whitespace-nowrap hover:text-lake ${active ? "font-bold text-ink" : ""}`}>
                      {c.header}
                      <Icon className={`h-3 w-3 ${active ? "" : "opacity-40"}`} aria-hidden />
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={rowKey(r)} {...rowProps?.(r)}>
              {columns.map((c) => (
                <td key={c.key} data-label={c.header} data-primary={c.primary ? "" : undefined} data-bare={c.bare ? "" : undefined} className={`${c.numeric ? "num" : ""} ${wide(c)} ${c.className ?? ""}`}>
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A count in a table cell: a nought is muted so the eye skips it. */
export function Num({ n }: { n: number }) {
  return <span className={n === 0 ? ZERO : "tabular-nums"}>{num(n)}</span>;
}

/** Marks on a row that needs a look: a small dot and a few words each, never a sentence. */
export function Flags({ flags }: { flags: { short: string; long: string }[] }) {
  if (flags.length === 0) return null;
  return (
    <span className="flex flex-wrap items-center gap-x-2.5 text-[11px] font-normal text-ink-3">
      {flags.map((f) => (
        <span key={f.short} title={f.long} className="inline-flex items-center gap-1 whitespace-nowrap">
          <span className="h-1.5 w-1.5 rounded-full bg-maple" aria-hidden />
          {f.short}
        </span>
      ))}
    </span>
  );
}
