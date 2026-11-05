/**
 * First and last names: required of everyone since 8 October 2026. New
 * accounts give them right after their first code; migrated accounts are
 * asked once, prefilled from the old site's "name shown" where it looked
 * like a full name. Letters, spaces, hyphens, apostrophes and periods
 * ("St. John"); nothing else. A phone's curly apostrophe is saved as a plain one.
 */

export const NAME_MAX = 40;
const NAME_RE = /^\p{L}[\p{L}\p{M}'. -]*$/u;
/** The apostrophes keyboards type in place of ' (an iPhone types ’ by default). */
const TYPOGRAPHIC_APOSTROPHES = /[\u2018\u2019\u02BC]/g;

export type NameCheck = { ok: true; value: string } | { ok: false; error: string };

export function checkName(input: unknown, label: string): NameCheck {
  const value = typeof input === "string" ? input.trim().replace(/\s+/g, " ").replace(TYPOGRAPHIC_APOSTROPHES, "'") : "";
  if (!value) return { ok: false, error: `Enter your ${label}.` };
  if (value.length > NAME_MAX) return { ok: false, error: `Your ${label} can be up to ${NAME_MAX} characters.` };
  if (!NAME_RE.test(value)) return { ok: false, error: `Your ${label} can only have letters, spaces, hyphens, apostrophes and periods.` };
  return { ok: true, value };
}

/** "First Last" for the account's display name. */
export function fullName(first: string, last: string): string {
  return `${first} ${last}`.trim();
}

/**
 * A guess at first and last from free text (the legacy "name shown", or the
 * account name). Two or more words that all look like names split into
 * first and the rest; one word is a first name only; anything else is
 * nothing. A guess only ever prefills a form.
 */
export function guessNames(text: string | null | undefined): { first: string | null; last: string | null } {
  const words = (text ?? "").trim().replace(/\s+/g, " ").split(" ").filter(Boolean);
  if (words.length === 0) return { first: null, last: null };
  const ok = (w: string) => checkName(w, "name").ok;
  if (!ok(words[0])) return { first: null, last: null };
  if (words.length === 1) return { first: words[0], last: null };
  const rest = words.slice(1).join(" ");
  // An initial ("Sam R.") is not a last name worth offering.
  return { first: words[0], last: ok(rest) && rest.replace(/[^\p{L}]/gu, "").length >= 2 ? rest : null };
}

export interface PosterNameParts {
  firstName: string | null;
  lastName: string | null;
  /** Names from before first and last were required: the listing's old "name shown", then the account name. */
  legacyNames: (string | null | undefined)[];
  email: string;
  legacyNetid: string | null;
}

/** True when `text` is only the person's old-site username or the first part of their email, which is never shown as a name. */
export function isLoginId(text: string, p: { email: string; legacyNetid: string | null }): boolean {
  const t = text.trim().toLowerCase();
  return t === p.email.split("@")[0].toLowerCase() || (p.legacyNetid !== null && t === p.legacyNetid.toLowerCase());
}

/**
 * The name other students see on a listing: the account's first and last
 * name. Until someone has given those (a migrated poster who has not signed
 * in since), their old "name shown", unless it was just their login.
 * Null means show no name at all ("the poster").
 */
export function posterName(p: PosterNameParts): string | null {
  if (p.firstName?.trim() && p.lastName?.trim()) return fullName(p.firstName.trim(), p.lastName.trim());
  for (const n of p.legacyNames) {
    const text = n?.trim().replace(/\s+/g, " ");
    if (text && !isLoginId(text, p)) return text;
  }
  return null;
}

/** The first word of the poster's name, for a "Hi Sam," line; null when there is no name to use. */
export function posterFirstName(p: PosterNameParts): string | null {
  // A complete pair was typed by the person, so it is trusted as posterName trusts it; a lone first name may be an imported login.
  if (p.firstName?.trim() && p.lastName?.trim()) return p.firstName.trim();
  if (p.firstName?.trim()) return isLoginId(p.firstName, p) ? null : p.firstName.trim();
  return posterName(p)?.split(" ")[0] ?? null;
}
