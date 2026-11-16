import { and, count, countDistinct, eq, inArray, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { listingOutcomeAsks, listingOutcomes, listings, listingSemesters, semesters, user } from "@/db/schema";
import { FINAL_OUTCOMES, type Outcome, type OutcomeSource, type OutcomeSummary, summarizeOutcomes } from "@/lib/listing-outcome";
import { posterFirstName } from "@/lib/person-name";

/**
 * listing_outcomes and listing_outcome_asks. Nothing here decides who may
 * answer: the callers do (deleteListingFor() finds the listing by the
 * poster's own id and deletes it under that filter first; an email answer
 * carries a signed token for the listing). These take the listing id that
 * check produced.
 */

export interface OutcomeAnswer {
  listingId: number;
  outcome: Outcome;
  source: OutcomeSource;
}

/**
 * Record or replace a listing's answer. The latest answer wins, except that
 * a Skip never replaces an answer already given. `stored` is false only for
 * that Skip.
 */
export async function recordOutcome(db: DbOrTx, a: OutcomeAnswer): Promise<{ id: number | null; stored: boolean; replaced: boolean }> {
  const [row] = await db
    .insert(listingOutcomes)
    .values({ listingId: a.listingId, outcome: a.outcome, source: a.source })
    .onConflictDoUpdate({
      target: listingOutcomes.listingId,
      set: { outcome: a.outcome, source: a.source, updatedAt: new Date() },
      setWhere: sql`excluded.outcome <> 'skipped'`,
    })
    .returning({ id: listingOutcomes.id, inserted: sql<boolean>`(xmax = 0)` });
  if (!row) return { id: null, stored: false, replaced: false };
  return { id: row.id, stored: true, replaced: !row.inserted };
}

export async function outcomeFor(db: DbOrTx, listingId: number): Promise<{ outcome: Outcome; source: OutcomeSource; updatedAt: Date } | null> {
  const [row] = await db
    .select({ outcome: listingOutcomes.outcome, source: listingOutcomes.source, updatedAt: listingOutcomes.updatedAt })
    .from(listingOutcomes)
    .where(eq(listingOutcomes.listingId, listingId));
  return row ? { outcome: row.outcome as Outcome, source: row.source as OutcomeSource, updatedAt: row.updatedAt } : null;
}

/** The admin card: counts per outcome, and how the email has done. */
export async function outcomeSummary(db: DbOrTx): Promise<OutcomeSummary> {
  const rows = await db.select({ outcome: listingOutcomes.outcome, n: count() }).from(listingOutcomes).groupBy(listingOutcomes.outcome);
  const [{ asked }] = await db.select({ asked: countDistinct(listingOutcomeAsks.listingId) }).from(listingOutcomeAsks);
  const [{ askedAnswered }] = await db
    .select({ askedAnswered: countDistinct(listingOutcomeAsks.listingId) })
    .from(listingOutcomeAsks)
    .innerJoin(listingOutcomes, eq(listingOutcomes.listingId, listingOutcomeAsks.listingId))
    .where(inArray(listingOutcomes.outcome, [...FINAL_OUTCOMES]));
  return summarizeOutcomes(Object.fromEntries(rows.map((r) => [r.outcome, Number(r.n)])), Number(asked), Number(askedAnswered));
}

export interface AskRecipient {
  listingId: number;
  userId: string;
  email: string;
  /** First name for "Hi Sam,", or null; never the login. */
  name: string | null;
  address: string;
  status: string;
}

/**
 * Who the "still available?" email for a semester goes to: each listing that
 * archiving this semester would remove (it runs for no other semester that
 * is not archived), whose poster is not banned and has not asked for no
 * email, that has not been sent this semester's email already, and that has
 * no answer yet saying how it ended. Taken listings are included: "taken"
 * does not say where they found someone.
 */
export async function askRecipients(db: DbOrTx, code: string): Promise<AskRecipient[]> {
  const rows = await db
    .select({
      listingId: listings.id,
      userId: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      name: user.name,
      legacyNetid: user.legacyNetid,
      displayName: listings.displayName,
      address: listings.address,
      status: listings.status,
    })
    .from(listingSemesters)
    .innerJoin(listings, eq(listings.id, listingSemesters.listingId))
    .innerJoin(user, eq(user.id, listings.userId))
    .where(
      and(
        eq(listingSemesters.semesterCode, code),
        sql`coalesce(${user.banned}, false) = false`,
        eq(user.noEmail, false),
        sql`not exists (
          select 1 from ${listingSemesters} o join ${semesters} s on s.code = o.semester_code
          where o.listing_id = ${listings.id} and o.semester_code <> ${code} and s.archived_at is null)`,
        sql`not exists (select 1 from ${listingOutcomeAsks} a where a.listing_id = ${listings.id} and a.semester_code = ${code})`,
        sql`not exists (
          select 1 from ${listingOutcomes} o where o.listing_id = ${listings.id}
          and o.outcome in (${sql.join(FINAL_OUTCOMES.map((o) => sql`${o}`), sql`, `)}))`,
      ),
    )
    .orderBy(listings.id);
  return rows.map((r) => ({
    listingId: r.listingId,
    userId: r.userId,
    email: r.email,
    name: posterFirstName({ ...r, legacyNames: [r.displayName, r.name] }),
    address: r.address,
    status: r.status,
  }));
}

/** Claim a listing's email for a semester before sending it; false when it was already claimed (sent, or being sent). */
export async function claimAsk(db: DbOrTx, code: string, listingId: number): Promise<boolean> {
  const rows = await db.insert(listingOutcomeAsks).values({ semesterCode: code, listingId }).onConflictDoNothing().returning({ id: listingOutcomeAsks.id });
  return rows.length > 0;
}

/** Give a claim back after a failed send, so the next send tries again. */
export async function releaseAsk(db: DbOrTx, code: string, listingId: number): Promise<void> {
  await db.delete(listingOutcomeAsks).where(and(eq(listingOutcomeAsks.semesterCode, code), eq(listingOutcomeAsks.listingId, listingId)));
}

export async function askedCount(db: DbOrTx, code: string): Promise<number> {
  const [{ n }] = await db.select({ n: count() }).from(listingOutcomeAsks).where(eq(listingOutcomeAsks.semesterCode, code));
  return Number(n);
}
