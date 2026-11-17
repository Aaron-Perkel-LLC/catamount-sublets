import { and, asc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { listings, session, user } from "@/db/schema";
import { greetingName, posterFirstName } from "@/lib/person-name";
import { isTestAddress } from "@/server/email/send";
import { posterColumns } from "./names";

/**
 * The stale-listing cleanup's audience: posters migrated from the legacy
 * site who have never signed in here and still have a listing (archiving a
 * semester deletes its listings, so a listing row is a live one).
 *
 * "Never signed in" is checked three ways, all of which a sign-in leaves
 * behind: last_login_at (set by the session-create hook, live since cutover;
 * the importer leaves it null), email_verified (better-auth sets it on an OTP
 * sign-in; the importer sets false) and any session row. One sign of a
 * sign-in keeps the person out, so a missed hook can never get them removed.
 *
 * Banned accounts, admins and test addresses are left out. People who asked
 * for no email are returned apart (`noEmail`), never mixed into `mail`.
 * Used by scripts/admin/send-stale-notice.ts and remove-stale.ts, which are
 * the only readers: the rows carry the address, for the admin's own scripts.
 */

export interface StaleRow {
  id: string;
  email: string;
  /** For "Hi Sam,"; null means "Hi," alone (never their login, never a squashed lower-case name). */
  firstName: string | null;
  listingId: number;
  /** The street line of the listing's address; null when it has no street name to say ("your listing" alone). */
  street: string | null;
  /** The listing's first semester code, for counts. */
  semester: string | null;
  status: string;
}

export interface StaleAudience {
  mail: StaleRow[];
  noEmail: StaleRow[];
}

/**
 * "12 Main St, Burlington, VT 05401" → "12 Main St". A house number that got
 * its own comma takes the next part with it ("235, Pearl Street, …" →
 * "235 Pearl Street"). Null when what is left has no letters ("235"): the
 * mail then says "your listing" and names no street.
 */
export function streetOf(address: string): string | null {
  const parts = address.split(",").map((p) => p.trim());
  let street = parts[0] || address.trim();
  if (/^\d+$/.test(street) && parts[1]) street = `${street} ${parts[1]}`;
  return /\p{L}/u.test(street) ? street : null;
}

/** True when the account shows no sign-in on this site by any of the three signals. */
export const neverSignedIn = and(
  isNull(user.lastLoginAt),
  eq(user.emailVerified, false),
  sql`not exists (select 1 from ${session} where ${session.userId} = ${user.id})`,
);

export async function staleAudience(db: DbOrTx): Promise<StaleAudience> {
  const rows = await db
    .select({
      id: user.id,
      email: user.email,
      ...posterColumns,
      noEmail: user.noEmail,
      listingId: listings.id,
      address: listings.address,
      displayName: listings.displayName,
      status: listings.status,
      semester: sql<string | null>`(select ls.semester_code from listing_semesters ls where ls.listing_id = ${listings.id} order by ls.position limit 1)`,
    })
    .from(user)
    .innerJoin(listings, eq(listings.userId, user.id))
    .where(and(isNotNull(user.legacyNetid), neverSignedIn, sql`coalesce(${user.banned}, false) = false`, sql`${user.role} is distinct from 'admin'`))
    .orderBy(asc(listings.id));
  const out: StaleAudience = { mail: [], noEmail: [] };
  for (const r of rows) {
    if (isTestAddress(r.email)) continue;
    const row: StaleRow = {
      id: r.id,
      email: r.email,
      firstName: greetingName(posterFirstName({ ...r, legacyNames: [r.displayName, r.name] })),
      listingId: r.listingId,
      street: streetOf(r.address),
      semester: r.semester,
      status: r.status,
    };
    (r.noEmail ? out.noEmail : out.mail).push(row);
  }
  return out;
}

/** Whether one account still shows no sign-in, read again just before it is removed. */
export async function stillNeverSignedIn(db: DbOrTx, userId: string): Promise<boolean> {
  const [r] = await db
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.id, userId), isNotNull(user.legacyNetid), neverSignedIn, sql`coalesce(${user.banned}, false) = false`, sql`${user.role} is distinct from 'admin'`, eq(user.noEmail, false)));
  return Boolean(r);
}
