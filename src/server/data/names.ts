import { eq } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { user } from "@/db/schema";
import { fullName, guessNames, isLoginId, posterName } from "@/lib/person-name";

/**
 * The account's first and last name. Read from the row, never from the
 * session cookie's cache, so the welcome gate lifts the moment a name is
 * saved rather than up to five minutes later.
 */
export async function getNames(db: DbOrTx, userId: string): Promise<{ first: string | null; last: string | null; prefill: { first: string; last: string }; complete: boolean }> {
  const [row] = await db.select({ first: user.firstName, last: user.lastName, name: user.name, email: user.email, legacyNetid: user.legacyNetid }).from(user).where(eq(user.id, userId));
  if (!row) return { first: null, last: null, prefill: { first: "", last: "" }, complete: false };
  const complete = Boolean(row.first && row.last);
  // Both names saved means the person typed them, so they show as they are, even when a first name matches the email ("sam@…" is Sam).
  if (complete) return { first: row.first, last: row.last, prefill: { first: row.first ?? "", last: row.last ?? "" }, complete };
  // A guess only prefills: the stored name is a legacy "name shown", unless it is just the email's local part.
  const guess = row.first || row.last ? { first: row.first, last: row.last } : row.name === row.email.split("@")[0] ? { first: null, last: null } : guessNames(row.name);
  // Never offer a login as a name: the import stored some as first names where the old "name shown" was the old-site username. Those records are never complete.
  const offer = (v: string | null | undefined) => (v && !isLoginId(v, row) ? v : "");
  return { first: row.first, last: row.last, prefill: { first: offer(row.first ?? guess.first), last: offer(row.last ?? guess.last) }, complete };
}

export async function setNames(db: DbOrTx, userId: string, first: string, last: string): Promise<void> {
  await db.update(user).set({ firstName: first, lastName: last, name: fullName(first, last) }).where(eq(user.id, userId));
}

/** What a person's shown name is made from: select these with the user table joined. */
export const posterColumns = { firstName: user.firstName, lastName: user.lastName, name: user.name, legacyNetid: user.legacyNetid };
export type PosterColumns = { firstName: string | null; lastName: string | null; name: string; legacyNetid: string | null };

/** The name a listing, the admin pages and the admin's notices show for someone (posterName in src/lib/person-name.ts); null for none. */
export function shownName(l: { displayName: string | null } | null, poster: PosterColumns, email: string): string | null {
  return posterName({ ...poster, legacyNames: [l?.displayName, poster.name], email });
}
