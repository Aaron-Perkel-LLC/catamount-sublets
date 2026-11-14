import { z } from "zod";

/** The admin People tab's search box: what may be typed, shared by the box, the URL and the Server Action. */
export const PEOPLE_QUERY_MAX = 100;
export const peopleQuery = z.string().trim().max(PEOPLE_QUERY_MAX);

/** `?q=` from the admin page's URL, or "" when missing or too long to be a search. */
export function parsePeopleQuery(raw: unknown): string {
  const r = peopleQuery.safeParse(typeof raw === "string" ? raw : "");
  return r.success ? r.data : "";
}

/** Escapes LIKE's wildcards (and the escape itself) so `%` and `_` match literally. Pair with ESCAPE '\'. */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Splits `text` around case-insensitive occurrences of `q`, for highlighting a match. */
export function highlightParts(text: string, q: string): { text: string; hit: boolean }[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [{ text, hit: false }];
  const parts: { text: string; hit: boolean }[] = [];
  const hay = text.toLowerCase();
  let at = 0;
  for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, at)) {
    if (i > at) parts.push({ text: text.slice(at, i), hit: false });
    parts.push({ text: text.slice(i, i + needle.length), hit: true });
    at = i + needle.length;
  }
  if (at < text.length) parts.push({ text: text.slice(at), hit: false });
  return parts;
}
