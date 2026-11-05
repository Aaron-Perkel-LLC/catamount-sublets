/**
 * A listing runs for one semester or several back to back: Summer and Fall
 * 2027, or Fall 2026 and Spring 2027. A gap means a second listing, posted
 * once the first is over.
 *
 * Order and adjacency come from the semester's *name* ("Spring 2027"), not
 * from the admin's sort_order. Within a year the terms run Spring, Summer,
 * Fall; Fall is followed by the next Spring (winter break is not a semester).
 * A name that does not read as a term and a year can only stand alone.
 *
 * Pure functions; the database side is src/server/data/semesters.ts.
 */

const TERMS = { spring: 0, summer: 1, fall: 2 } as const;
type Term = keyof typeof TERMS;

export interface SemesterParts {
  year: number;
  termIndex: number;
  /** Capitalised: "Spring". */
  term: string;
}

/** [year, term index, term word] for "Summer 2027", or null. */
export function semesterParts(name: string): SemesterParts | null {
  const m = /\b(spring|summer|fall)\s+(\d{4})\b/i.exec(name);
  if (!m) return null;
  const word = m[1].toLowerCase() as Term;
  return { year: Number(m[2]), termIndex: TERMS[word], term: word[0].toUpperCase() + word.slice(1) };
}

/** The code the admin form suggests for a name: "Fall 2028" → "fall28"; "" when the name is not a term and a year. */
export function suggestedCode(name: string): string {
  const p = semesterParts(name);
  return p === null ? "" : `${p.term.toLowerCase()}${String(p.year).slice(-2)}`;
}

/** A number that goes up by exactly one from each semester to the next. */
export function semesterKey(name: string): number | null {
  const p = semesterParts(name);
  return p === null ? null : p.year * 3 + p.termIndex;
}

/**
 * Whether these semester names run back to back with no gap. One semester is
 * always fine; two or more must all read as a term and year, with no
 * duplicates.
 */
export function semestersBackToBack(names: readonly string[]): boolean {
  if (names.length <= 1) return true;
  const keys: number[] = [];
  for (const name of names) {
    const key = semesterKey(name);
    if (key === null) return false;
    keys.push(key);
  }
  keys.sort((a, b) => a - b);
  for (let i = 1; i < keys.length; i++) {
    if (keys[i] !== keys[i - 1] + 1) return false;
  }
  return true;
}

export interface SemesterLike {
  name: string;
  sortOrder?: number;
}

/**
 * Semesters in calendar order: by term and year where the name says,
 * otherwise by sort_order, then by name. Does not mutate the input.
 */
export function sortSemesters<T extends SemesterLike>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    const ka = semesterKey(a.name);
    const kb = semesterKey(b.name);
    if (ka !== null && kb !== null) return ka - kb;
    const na = ka === null ? 1 : 0;
    const nb = kb === null ? 1 : 0;
    if (na !== nb) return na - nb;
    const sa = a.sortOrder ?? 0;
    const sb = b.sortOrder ?? 0;
    if (sa !== sb) return sa - sb;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });
}

/**
 * One label for a run of semesters already in calendar order:
 *
 *   Spring 2027
 *   Summer & Fall 2027
 *   Fall 2027 & Spring 2028
 *   Spring–Fall 2027
 *   Summer 2027–Spring 2028
 *
 * Names that are not a term and year are joined with "&".
 */
export function semesterLabel(names: readonly string[]): string {
  const list = names.map(String).filter((n) => n.length > 0);
  if (list.length <= 1) return list[0] ?? "";
  const parts = list.map(semesterParts);
  if (parts.some((p) => p === null)) return list.join(" & ");
  const first = parts[0]!;
  const last = parts[parts.length - 1]!;
  const join = parts.length === 2 ? " & " : "–";
  return first.year === last.year
    ? `${first.term}${join}${last.term} ${last.year}`
    : `${first.term} ${first.year}${join}${last.term} ${last.year}`;
}

/**
 * Codes in calendar order with their position (0 = first), for writing
 * listing_semesters. Throws on a gap; validate with semestersBackToBack first.
 */
export function orderSemesterCodes(
  semesters: readonly { code: string; name: string; sortOrder?: number }[],
): { code: string; position: number }[] {
  return sortSemesters(semesters).map((s, i) => ({ code: s.code, position: i }));
}
