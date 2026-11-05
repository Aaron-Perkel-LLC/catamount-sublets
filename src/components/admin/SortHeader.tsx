"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useMemo, useState } from "react";
import { nextSort, type SortDir, type SortState, type SortValue, sortRows } from "./sort";

/** A table's sort: the rows in order, the state, and what a header click does. */
export function useSort<T, K extends string>(rows: readonly T[], value: (row: T, key: K) => SortValue, initial: SortState<K>) {
  const [sort, setSort] = useState(initial);
  const sorted = useMemo(() => sortRows(rows, value, sort), [rows, value, sort]);
  return { sorted, sort, setSort, onSort: (key: K, firstDir: SortDir) => setSort((s) => nextSort(s, key, firstDir)) };
}

/** A column header that sorts: the whole label is the button, and the arrow says which way. */
export function SortHeader<K extends string>({
  label,
  column,
  sort,
  onSort,
  firstDir = "asc",
  className = "",
}: {
  label: string;
  column: K;
  sort: SortState<K>;
  onSort: (key: K, firstDir: SortDir) => void;
  firstDir?: SortDir;
  className?: string;
}) {
  const active = sort.key === column;
  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className={`py-1 pr-3 font-normal ${className}`}>
      <button type="button" onClick={() => onSort(column, firstDir)} className={`inline-flex items-center gap-1 text-xs whitespace-nowrap hover:text-lake ${active ? "font-bold text-ink" : ""}`}>
        {label}
        <Icon className={`h-3 w-3 ${active ? "" : "opacity-40"}`} aria-hidden />
      </button>
    </th>
  );
}
