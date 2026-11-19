"use client";

import { useMemo, useState } from "react";
import { nextSort, type SortDir, type SortState, type SortValue, sortRows } from "./sort";

/** A table's sort: the rows in order, the state, and what a header click does (DataTable draws the headers). */
export function useSort<T, K extends string>(rows: readonly T[], value: (row: T, key: K) => SortValue, initial: SortState<K>) {
  const [sort, setSort] = useState(initial);
  const sorted = useMemo(() => sortRows(rows, value, sort), [rows, value, sort]);
  return { sorted, sort, setSort, onSort: (key: K, firstDir: SortDir) => setSort((s) => nextSort(s, key, firstDir)) };
}
