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
  /** Only in a phone's card: a detail the desktop row has no room for. */
  phoneOnly?: boolean;
  /** The header is for screen readers only (a column of row actions). */
  srHeader?: boolean;
  /** Not in a phone's card (the primary cell already shows it there). */
  desktopOnly?: boolean;
  /** Sortable under this key (the parent holds the sort: useSort.ts). */
  sort?: K;
  firstDir?: SortDir;
  className?: string;
}

/**
 * The admin's one table: a quiet header, hairline rows, numbers
 * right-aligned in tabular figures. On a phone the same markup (so any state
 * inside a cell exists once) becomes a card per row: the row's name, then the
 * other cells as labelled values two abreast, each labelled from its header
 * (data-label). A cell that renders nothing takes no room there. Meant to
 * sit flush inside a Card.
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
  const wide = (c: Column<T, K>) => (c.phoneOnly ? "md:hidden" : c.wide ? "md:max-lg:hidden" : "");
  const ROW = "border-t border-line-light max-md:grid max-md:grid-cols-2 max-md:items-center max-md:gap-x-6 max-md:gap-y-1 max-md:px-4 max-md:py-3";
  const props = (r: T) => {
    const { className, ...rest } = rowProps?.(r) ?? {};
    return { ...rest, className: `${ROW} ${className ?? ""}` };
  };
  /** A cell on a phone: hidden, the card's unlabelled first line, an unlabelled last line, or a labelled value. */
  const phone = (c: Column<T, K>) =>
    c.desktopOnly
      ? "max-md:hidden"
      : c.primary
        ? "max-md:col-span-2 max-md:block max-md:pb-1 max-md:text-left max-md:text-sm"
        : c.bare
          ? "max-md:col-span-2 max-md:block max-md:pt-1 max-md:text-left"
          : "max-md:flex max-md:items-baseline max-md:justify-between max-md:gap-4 max-md:text-right max-md:empty:hidden max-md:before:shrink-0 max-md:before:text-left max-md:before:text-xs max-md:before:font-normal max-md:before:text-ink-3 max-md:before:content-[attr(data-label)]";
  return (
    <div className="overflow-x-auto">
      {/* The roles are spelled out because the phone layout changes these elements' display, which can drop a table's meaning. */}
      <table role="table" className="w-full text-[13px] max-md:block" aria-label={label}>
        <thead role="rowgroup" className="max-md:hidden">
          <tr role="row">
            {columns.map((c) => {
              const active = Boolean(c.sort && sort?.key === c.sort);
              const Icon = !active ? ArrowUpDown : sort?.dir === "asc" ? ArrowUp : ArrowDown;
              return (
                <th key={c.key} role="columnheader" scope="col" aria-sort={c.sort ? (active ? (sort?.dir === "asc" ? "ascending" : "descending") : "none") : undefined} className={`px-2 py-2 text-xs font-normal whitespace-nowrap text-ink-3 first:pl-4 last:pr-4 ${c.numeric ? "text-right" : "text-left"} ${wide(c)}`}>
                  {c.sort && onSort ? (
                    <button type="button" onClick={() => onSort(c.sort as K, c.firstDir ?? (c.numeric ? "desc" : "asc"))} className={`inline-flex items-center gap-1 text-xs whitespace-nowrap hover:text-lake ${active ? "font-bold text-ink" : ""}`}>
                      {c.header}
                      <Icon className={`h-3 w-3 ${active ? "" : "opacity-40"}`} aria-hidden />
                    </button>
                  ) : c.srHeader ? (
                    <span className="sr-only">{c.header}</span>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody role="rowgroup" className="max-md:block">
          {rows.map((r) => (
            <tr key={rowKey(r)} role="row" {...props(r)}>
              {columns.map((c) => (
                <td key={c.key} role="cell" data-label={c.header} data-primary={c.primary ? "" : undefined} data-bare={c.bare ? "" : undefined} className={`px-2 py-2 align-top first:pl-4 last:pr-4 max-md:p-0 max-md:first:pl-0 max-md:last:pr-0 ${c.numeric ? "text-right tabular-nums" : ""} ${wide(c)} ${phone(c)} ${c.className ?? ""}`}>
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
