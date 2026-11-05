/** Column sorting for the admin tables: pure, so it is tested on its own. */

export type SortDir = "asc" | "desc";
export interface SortState<K extends string> {
  key: K;
  dir: SortDir;
}
export type SortValue = string | number | null | undefined;

const empty = (v: SortValue) => v === null || v === undefined || v === "";

/**
 * Rows ordered by one column. Empty values sit at the end whichever way the
 * column runs; text compares as people read it ("#9" before "#10", case
 * ignored); ties keep the order the rows came in.
 */
export function sortRows<T, K extends string>(rows: readonly T[], value: (row: T, key: K) => SortValue, sort: SortState<K>): T[] {
  const sign = sort.dir === "asc" ? 1 : -1;
  return rows
    .map((row, i) => ({ row, i, v: value(row, sort.key) }))
    .sort((a, b) => {
      if (empty(a.v) || empty(b.v)) return empty(a.v) === empty(b.v) ? a.i - b.i : empty(a.v) ? 1 : -1;
      const c =
        typeof a.v === "number" && typeof b.v === "number"
          ? a.v - b.v
          : String(a.v).localeCompare(String(b.v), "en", { sensitivity: "base", numeric: true });
      return c === 0 ? a.i - b.i : sign * c;
    })
    .map((x) => x.row);
}

/** A click on the sorted column flips it; a click on another starts it in that column's natural direction. */
export function nextSort<K extends string>(current: SortState<K>, key: K, firstDir: SortDir): SortState<K> {
  return current.key === key ? { key, dir: current.dir === "asc" ? "desc" : "asc" } : { key, dir: firstDir };
}
