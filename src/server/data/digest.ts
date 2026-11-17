import { and, asc, count, eq, inArray, lt, max, sql } from "drizzle-orm";
import type { Db, DbOrTx } from "@/db";
import { digestSends, digestSubscriptions, savedSearches, user } from "@/db/schema";
import { DIGEST } from "@/config/site";
import type { DigestDisabledVia, DigestSendStatus } from "@/lib/digest";

/**
 * Saved searches, the digest opt-in, and the digest's send record. Every
 * function that changes a person's own rows takes their id and filters by
 * it; zero rows changed is "not found" to the caller (hard rule 6).
 */

/* ------------------------------------------------------- saved searches */

export interface SavedSearchRow {
  id: number;
  name: string;
  query: string;
  createdAt: Date;
}

export async function savedSearchesFor(db: DbOrTx, userId: string): Promise<SavedSearchRow[]> {
  return db
    .select({ id: savedSearches.id, name: savedSearches.name, query: savedSearches.query, createdAt: savedSearches.createdAt })
    .from(savedSearches)
    .where(eq(savedSearches.userId, userId))
    .orderBy(asc(savedSearches.createdAt), asc(savedSearches.id));
}

export type SaveSearchResult = { ok: true; id: number } | { ok: false; reason: "limit" | "duplicate" | "no_user" };

/**
 * Save a search (the query already canonical). The person's row is locked
 * for the transaction, so two saves at once cannot both slip under the cap.
 */
export async function insertSavedSearch(db: Db, userId: string, v: { name: string; query: string }): Promise<SaveSearchResult> {
  return db.transaction(async (tx) => {
    const [me] = await tx.select({ id: user.id }).from(user).where(eq(user.id, userId)).for("update");
    if (!me) return { ok: false, reason: "no_user" } as const;
    const [dup] = await tx
      .select({ id: savedSearches.id })
      .from(savedSearches)
      .where(and(eq(savedSearches.userId, userId), eq(savedSearches.query, v.query)));
    if (dup) return { ok: false, reason: "duplicate" } as const;
    const [{ n }] = await tx.select({ n: count() }).from(savedSearches).where(eq(savedSearches.userId, userId));
    if (Number(n) >= DIGEST.maxSavedSearches) return { ok: false, reason: "limit" } as const;
    const [row] = await tx.insert(savedSearches).values({ userId, name: v.name, query: v.query }).returning({ id: savedSearches.id });
    return { ok: true, id: row.id } as const;
  });
}

/** Rename one of the person's own searches; false when it isn't theirs or is gone. */
export async function renameSavedSearch(db: DbOrTx, userId: string, id: number, name: string): Promise<boolean> {
  const rows = await db
    .update(savedSearches)
    .set({ name })
    .where(and(eq(savedSearches.id, id), eq(savedSearches.userId, userId)))
    .returning({ id: savedSearches.id });
  return rows.length === 1;
}

/** Delete one of the person's own searches; false when it isn't theirs or is gone. */
export async function deleteSavedSearch(db: DbOrTx, userId: string, id: number): Promise<boolean> {
  const rows = await db
    .delete(savedSearches)
    .where(and(eq(savedSearches.id, id), eq(savedSearches.userId, userId)))
    .returning({ id: savedSearches.id });
  return rows.length === 1;
}

/* ---------------------------------------------------------- the opt-in */

export interface DigestSubscription {
  enabled: boolean;
  enabledAt: Date | null;
}

export async function digestSubscriptionFor(db: DbOrTx, userId: string): Promise<DigestSubscription> {
  const [row] = await db
    .select({ enabled: digestSubscriptions.enabled, enabledAt: digestSubscriptions.enabledAt })
    .from(digestSubscriptions)
    .where(eq(digestSubscriptions.userId, userId));
  return row ?? { enabled: false, enabledAt: null };
}

/**
 * Turn the digest on or off for the person. Turning it on stamps
 * `enabled_at` (where their next digest's window starts) only when it was
 * off; turning it on again while on changes nothing. Off records how.
 */
export async function setDigestEnabled(db: DbOrTx, userId: string, enabled: boolean, via: DigestDisabledVia): Promise<void> {
  const now = new Date();
  if (enabled) {
    await db
      .insert(digestSubscriptions)
      .values({ userId, enabled: true, enabledAt: now, disabledVia: null })
      .onConflictDoUpdate({
        target: digestSubscriptions.userId,
        set: {
          enabled: true,
          enabledAt: sql`case when ${digestSubscriptions.enabled} then ${digestSubscriptions.enabledAt} else ${now.toISOString()}::timestamptz end`,
          disabledVia: null,
          updatedAt: now,
        },
      });
  } else {
    await db
      .update(digestSubscriptions)
      .set({ enabled: false, disabledVia: via, updatedAt: now })
      .where(and(eq(digestSubscriptions.userId, userId), eq(digestSubscriptions.enabled, true)));
  }
}

/* ---------------------------------------------------------- recipients */

export interface DigestCandidate {
  userId: string;
  email: string;
  banned: boolean;
  noEmail: boolean;
  enabledAt: Date | null;
  searches: { name: string; query: string }[];
  /** Where the last digest that went (or found nothing) ended; null before the first. */
  lastWindowEnd: Date | null;
}

/**
 * Everyone with the digest on, with their searches and where their last
 * window ended. The caller decides who is skipped (banned, Stop email, test
 * address, no searches) so the admin can see why. Deleted accounts are gone
 * with their rows.
 */
export async function digestCandidates(db: DbOrTx): Promise<DigestCandidate[]> {
  const people = await db
    .select({ userId: user.id, email: user.email, banned: user.banned, noEmail: user.noEmail, enabledAt: digestSubscriptions.enabledAt })
    .from(digestSubscriptions)
    .innerJoin(user, eq(user.id, digestSubscriptions.userId))
    .where(eq(digestSubscriptions.enabled, true))
    .orderBy(asc(digestSubscriptions.enabledAt), asc(user.id));
  if (people.length === 0) return [];
  const ids = people.map((p) => p.userId);
  const [searches, ends] = await Promise.all([
    db
      .select({ userId: savedSearches.userId, name: savedSearches.name, query: savedSearches.query })
      .from(savedSearches)
      .where(inArray(savedSearches.userId, ids))
      .orderBy(asc(savedSearches.createdAt), asc(savedSearches.id)),
    db
      .select({ userId: digestSends.userId, end: max(digestSends.windowEnd) })
      .from(digestSends)
      .where(and(inArray(digestSends.userId, ids), inArray(digestSends.status, ["sent", "empty"])))
      .groupBy(digestSends.userId),
  ]);
  const byUser = new Map<string, { name: string; query: string }[]>();
  for (const s of searches) byUser.set(s.userId, [...(byUser.get(s.userId) ?? []), { name: s.name, query: s.query }]);
  const endByUser = new Map(ends.map((e) => [e.userId, e.end]));
  return people.map((p) => ({
    userId: p.userId,
    email: p.email,
    banned: p.banned === true,
    noEmail: p.noEmail,
    enabledAt: p.enabledAt,
    searches: byUser.get(p.userId) ?? [],
    lastWindowEnd: endByUser.get(p.userId) ?? null,
  }));
}

/* -------------------------------------------------------- send records */

export interface DigestSendRow {
  id: number;
  status: DigestSendStatus;
  windowStart: Date;
  windowEnd: Date;
  attemptedAt: Date;
}

const sendColumns = {
  id: digestSends.id,
  status: digestSends.status,
  windowStart: digestSends.windowStart,
  windowEnd: digestSends.windowEnd,
  attemptedAt: digestSends.attemptedAt,
};

/**
 * The claim: this week's row for the person, written as pending before
 * anything is sent. Null when the row already exists (sent, empty, failed,
 * or another run has it), which is what makes a doubled cron harmless.
 */
export async function claimDigestSend(db: DbOrTx, v: { userId: string; week: string; windowStart: Date; windowEnd: Date }): Promise<DigestSendRow | null> {
  const [row] = await db.insert(digestSends).values(v).onConflictDoNothing({ target: [digestSends.userId, digestSends.week] }).returning(sendColumns);
  return row ? { ...row, status: row.status as DigestSendStatus } : null;
}

export async function digestSendFor(db: DbOrTx, userId: string, week: string): Promise<DigestSendRow | null> {
  const [row] = await db
    .select(sendColumns)
    .from(digestSends)
    .where(and(eq(digestSends.userId, userId), eq(digestSends.week, week)));
  return row ? { ...row, status: row.status as DigestSendStatus } : null;
}

/** Take over a row left pending since before `staleBefore` (its run died mid-send). True for the one caller that wins it. */
export async function retakeStaleDigestSend(db: DbOrTx, id: number, staleBefore: Date): Promise<boolean> {
  const rows = await db
    .update(digestSends)
    .set({ attemptedAt: new Date() })
    .where(and(eq(digestSends.id, id), eq(digestSends.status, "pending"), lt(digestSends.attemptedAt, staleBefore)))
    .returning({ id: digestSends.id });
  return rows.length === 1;
}

export async function settleDigestSend(
  db: DbOrTx,
  id: number,
  outcome: { status: "sent"; searches: number; matches: number; resendId: string | null } | { status: "empty"; searches: number } | { status: "failed"; searches: number; matches: number; error: string },
): Promise<void> {
  await db
    .update(digestSends)
    .set({
      status: outcome.status,
      searches: outcome.searches,
      matches: outcome.status === "empty" ? 0 : Math.min(outcome.matches, 32_767),
      resendId: outcome.status === "sent" ? outcome.resendId : null,
      error: outcome.status === "failed" ? outcome.error.slice(0, 500) : null,
    })
    .where(and(eq(digestSends.id, id), eq(digestSends.status, "pending")));
}

/** The daily sweep: a row pending since before `before` will not settle on its own (its idempotency key has lapsed at Resend too). */
export async function failStaleDigestSends(db: DbOrTx, before: Date): Promise<number> {
  const rows = await db
    .update(digestSends)
    .set({ status: "failed", error: "interrupted" })
    .where(and(eq(digestSends.status, "pending"), lt(digestSends.attemptedAt, before)))
    .returning({ id: digestSends.id });
  return rows.length;
}

/** This week's rows by status, and the most recent week that has any, for the admin. */
export async function digestWeekCounts(db: DbOrTx, week: string): Promise<Record<DigestSendStatus, number>> {
  const rows = await db.select({ status: digestSends.status, n: count() }).from(digestSends).where(eq(digestSends.week, week)).groupBy(digestSends.status);
  const out: Record<DigestSendStatus, number> = { pending: 0, sent: 0, empty: 0, failed: 0 };
  for (const r of rows) out[r.status as DigestSendStatus] = Number(r.n);
  return out;
}

export async function lastDigestWeek(db: DbOrTx): Promise<string | null> {
  const [row] = await db.select({ week: max(digestSends.week) }).from(digestSends);
  return row?.week ?? null;
}

/** How many people have the digest on, and how many saved searches exist, for the admin's summary line. */
export async function digestTotals(db: DbOrTx): Promise<{ subscribed: number; searches: number }> {
  const [[a], [b]] = await Promise.all([
    db.select({ n: count() }).from(digestSubscriptions).where(eq(digestSubscriptions.enabled, true)),
    db.select({ n: count() }).from(savedSearches),
  ]);
  return { subscribed: Number(a.n), searches: Number(b.n) };
}
