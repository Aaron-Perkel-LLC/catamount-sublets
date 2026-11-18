import { and, count, desc, eq, gte, lt, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { DbOrTx } from "@/db";
import { listings, posterMessages, user } from "@/db/schema";
import type { AccountTier } from "@/lib/auth-allow";
import type { PosterMessageStatus } from "@/lib/poster-message";
import { shownName } from "./names";
import { labelFor, listingSemestersByListing } from "./semesters";
import { audienceWhere } from "./visibility";

/**
 * The message relay's records (src/server/services/poster-message.ts). Only
 * that service and the admin read them; the poster's address never leaves
 * this module except into the email itself.
 */

/**
 * Where a relay message about a listing may go: only a listing on the public
 * board (a community account sees nothing else, so it can message nothing
 * else), with the poster's reply address. `accepting` is false when the poster
 * turned outside messages off, or asked for no email at all.
 */
export interface RelayTarget {
  listingId: number;
  posterId: string;
  /** The listing's contact email, else the account's. Never shown to the sender. */
  posterEmail: string;
  accepting: boolean;
  price: number;
  semesterLabel: string;
}

export async function relayTarget(db: DbOrTx, listingId: number): Promise<RelayTarget | null> {
  const [row] = await db
    .select({
      id: listings.id,
      userId: listings.userId,
      contactEmail: listings.contactEmail,
      accountEmail: user.email,
      accepts: listings.acceptsOutsideMessages,
      noEmail: user.noEmail,
      price: listings.price,
    })
    .from(listings)
    .innerJoin(user, eq(user.id, listings.userId))
    .where(and(eq(listings.id, listingId), audienceWhere("public")))
    .limit(1);
  if (!row) return null;
  const semesters = (await listingSemestersByListing(db, [row.id])).get(row.id) ?? [];
  return {
    listingId: row.id,
    posterId: row.userId,
    posterEmail: row.contactEmail?.trim() || row.accountEmail,
    accepting: row.accepts && !row.noEmail,
    price: row.price,
    semesterLabel: labelFor(semesters, true).label,
  };
}

/** Writes the row as pending under the form's key; null when that key already has one. */
export async function claimPosterMessage(
  db: DbOrTx,
  v: { listingId: number; posterId: string; senderId: string; body: string; idempotencyKey: string },
): Promise<number | null> {
  const [row] = await db.insert(posterMessages).values(v).onConflictDoNothing({ target: posterMessages.idempotencyKey }).returning({ id: posterMessages.id });
  return row?.id ?? null;
}

export async function posterMessageByKey(
  db: DbOrTx,
  idempotencyKey: string,
): Promise<{ id: number; senderId: string; listingId: number | null; body: string; status: PosterMessageStatus; attemptedAt: Date } | null> {
  const [row] = await db
    .select({
      id: posterMessages.id,
      senderId: posterMessages.senderId,
      listingId: posterMessages.listingId,
      body: posterMessages.body,
      status: posterMessages.status,
      attemptedAt: posterMessages.attemptedAt,
    })
    .from(posterMessages)
    .where(eq(posterMessages.idempotencyKey, idempotencyKey));
  return row ? { ...row, status: row.status as PosterMessageStatus } : null;
}

/** Takes over a row stuck pending since before `staleBefore`, for a retry under the same key. True for the one caller that wins it. */
export async function retakeStalePosterMessage(db: DbOrTx, id: number, staleBefore: Date): Promise<boolean> {
  const rows = await db
    .update(posterMessages)
    .set({ attemptedAt: new Date() })
    .where(and(eq(posterMessages.id, id), eq(posterMessages.status, "pending"), lt(posterMessages.attemptedAt, staleBefore)))
    .returning({ id: posterMessages.id });
  return rows.length === 1;
}

export async function settlePosterMessage(db: DbOrTx, id: number, outcome: { status: "sent"; resendId: string | null } | { status: "failed"; error: string }): Promise<void> {
  await db
    .update(posterMessages)
    .set(outcome.status === "sent" ? { status: "sent", resendId: outcome.resendId, error: null } : { status: "failed", error: outcome.error })
    .where(and(eq(posterMessages.id, id), eq(posterMessages.status, "pending")));
}

/** Drops a claim that never reached Resend (a limit refused it), so the same form can try again later. */
export async function releasePosterMessage(db: DbOrTx, id: number): Promise<void> {
  await db.delete(posterMessages).where(and(eq(posterMessages.id, id), eq(posterMessages.status, "pending")));
}

/** The daily sweep: fail rows pending since before `before`, and delete rows older than `deleteBefore` (180 days). */
export async function sweepPosterMessages(db: DbOrTx, before: Date, deleteBefore: Date): Promise<{ failed: number; deleted: number }> {
  const failed = await db
    .update(posterMessages)
    .set({ status: "failed", error: "interrupted" })
    .where(and(eq(posterMessages.status, "pending"), lt(posterMessages.attemptedAt, before)))
    .returning({ id: posterMessages.id });
  const deleted = await db.delete(posterMessages).where(lt(posterMessages.createdAt, deleteBefore)).returning({ id: posterMessages.id });
  return { failed: failed.length, deleted: deleted.length };
}

/** Messages sent or received by an account, for the deletion report (they cascade with it). */
export async function countPosterMessagesFor(db: DbOrTx, userId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(posterMessages)
    .where(or(eq(posterMessages.senderId, userId), eq(posterMessages.posterId, userId)));
  return row?.n ?? 0;
}

/* ---------------------------------------------------------------- admin */

/** One relayed message, for the admin's Messages section. Admin only: it holds both people's addresses and the text. */
export interface PosterMessageRow {
  id: number;
  createdAt: Date;
  status: PosterMessageStatus;
  error: string | null;
  body: string;
  listingId: number | null;
  sender: { id: string; name: string | null; email: string; tier: AccountTier; banned: boolean };
  poster: { id: string; name: string | null };
}

export async function recentPosterMessages(db: DbOrTx, limit = 100): Promise<PosterMessageRow[]> {
  const sender = alias(user, "sender");
  const poster = alias(user, "poster");
  const rows = await db
    .select({
      id: posterMessages.id,
      createdAt: posterMessages.createdAt,
      status: posterMessages.status,
      error: posterMessages.error,
      body: posterMessages.body,
      listingId: posterMessages.listingId,
      senderId: sender.id,
      senderEmail: sender.email,
      senderTier: sender.tier,
      senderBanned: sender.banned,
      senderFirst: sender.firstName,
      senderLast: sender.lastName,
      senderName: sender.name,
      senderNetid: sender.legacyNetid,
      posterId: poster.id,
      posterEmail: poster.email,
      posterFirst: poster.firstName,
      posterLast: poster.lastName,
      posterName: poster.name,
      posterNetid: poster.legacyNetid,
    })
    .from(posterMessages)
    .innerJoin(sender, eq(sender.id, posterMessages.senderId))
    .innerJoin(poster, eq(poster.id, posterMessages.posterId))
    .orderBy(desc(posterMessages.id))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    status: r.status as PosterMessageStatus,
    error: r.error,
    body: r.body,
    listingId: r.listingId,
    sender: {
      id: r.senderId,
      name: shownName(null, { firstName: r.senderFirst, lastName: r.senderLast, name: r.senderName, legacyNetid: r.senderNetid }, r.senderEmail),
      email: r.senderEmail,
      tier: r.senderTier === "student" ? "student" : "community",
      banned: r.senderBanned === true,
    },
    poster: { id: r.posterId, name: shownName(null, { firstName: r.posterFirst, lastName: r.posterLast, name: r.posterName, legacyNetid: r.posterNetid }, r.posterEmail) },
  }));
}

/** Sent messages and distinct senders over the last 7 and 30 days, for the Messages section's summary. */
export async function posterMessageCounts(db: DbOrTx, now: Date = new Date()): Promise<{ days: 7 | 30; sent: number; senders: number; listings: number }[]> {
  const out: { days: 7 | 30; sent: number; senders: number; listings: number }[] = [];
  for (const days of [7, 30] as const) {
    const since = new Date(now.getTime() - days * 86_400_000);
    const [row] = await db
      .select({
        sent: count(),
        senders: sql<number>`count(distinct ${posterMessages.senderId})::int`,
        listings: sql<number>`count(distinct ${posterMessages.listingId})::int`,
      })
      .from(posterMessages)
      .where(and(eq(posterMessages.status, "sent"), gte(posterMessages.createdAt, since)));
    out.push({ days, sent: row?.sent ?? 0, senders: row?.senders ?? 0, listings: row?.listings ?? 0 });
  }
  return out;
}
