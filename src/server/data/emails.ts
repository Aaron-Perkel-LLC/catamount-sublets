import "server-only";
import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { emailDeliveries, emails, user } from "@/db/schema";
import type { DeliveryStatus, EmailAudience, EmailDraft, EmailResolution, EmailSender, EmailStatus } from "@/lib/email";

/**
 * The emails the admin writes and what happened to each recipient. Admin
 * only: every caller has passed requireAdmin(), and the acting admin's id is
 * recorded on what they create. Rows carry recipients' addresses, so nothing
 * here is for a page a student can reach.
 */

export interface EmailRow {
  id: number;
  status: EmailStatus;
  subject: string;
  body: string;
  audience: EmailAudience;
  toLabel: string | null;
  accessRequestId: number | null;
  resolve: EmailResolution | null;
  sender: EmailSender | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  sentAt: Date | null;
  finishedAt: Date | null;
}
export interface EmailCounts {
  sent: number;
  failed: number;
  leftOut: number;
  /** Queued or being sent now. */
  waiting: number;
}
export interface DeliveryRow {
  id: number;
  emailId: number;
  userId: string | null;
  address: string | null;
  greetedAs: string | null;
  posted: boolean;
  status: DeliveryStatus;
  reason: string | null;
  test: boolean;
  overridden: boolean;
  attempts: number;
  lastAttemptAt: Date | null;
  sentAt: Date | null;
}

const EMAIL_COLUMNS = {
  id: emails.id,
  status: emails.status,
  subject: emails.subject,
  body: emails.body,
  audience: emails.audience,
  toLabel: emails.toLabel,
  accessRequestId: emails.accessRequestId,
  resolve: emails.resolve,
  sender: emails.sender,
  createdBy: emails.createdBy,
  createdAt: emails.createdAt,
  updatedAt: emails.updatedAt,
  sentAt: emails.sentAt,
  finishedAt: emails.finishedAt,
};
const asEmail = (r: Record<keyof typeof EMAIL_COLUMNS, unknown>) => r as unknown as EmailRow;
const DELIVERY_COLUMNS = {
  id: emailDeliveries.id,
  emailId: emailDeliveries.emailId,
  userId: emailDeliveries.userId,
  address: emailDeliveries.address,
  greetedAs: emailDeliveries.greetedAs,
  posted: emailDeliveries.posted,
  status: emailDeliveries.status,
  reason: emailDeliveries.reason,
  test: emailDeliveries.test,
  overridden: emailDeliveries.overridden,
  attempts: emailDeliveries.attempts,
  lastAttemptAt: emailDeliveries.lastAttemptAt,
  sentAt: emailDeliveries.sentAt,
};
const asDelivery = (r: Record<keyof typeof DELIVERY_COLUMNS, unknown>) => r as unknown as DeliveryRow;

export async function createDraft(db: DbOrTx, adminId: string, init: Partial<EmailDraft> & { audience: EmailAudience; accessRequestId?: number | null }): Promise<number> {
  const [row] = await db
    .insert(emails)
    .values({ createdBy: adminId, audience: init.audience, subject: init.subject ?? "", body: init.body ?? "", accessRequestId: init.accessRequestId ?? null, resolve: init.resolve ?? null })
    .returning({ id: emails.id });
  return row.id;
}

/** Saves a draft's fields. False when it is no longer a draft (sent from another tab) or is gone. */
export async function saveDraft(db: DbOrTx, id: number, d: EmailDraft): Promise<boolean> {
  const rows = await db
    .update(emails)
    .set({ subject: d.subject, body: d.body, audience: d.audience, resolve: d.resolve })
    .where(and(eq(emails.id, id), eq(emails.status, "draft")))
    .returning({ id: emails.id });
  return rows.length > 0;
}

/** Throws a draft away. Only a draft: a sent email is a record. */
export async function deleteDraft(db: DbOrTx, id: number): Promise<boolean> {
  const rows = await db.delete(emails).where(and(eq(emails.id, id), eq(emails.status, "draft"))).returning({ id: emails.id });
  return rows.length > 0;
}

export async function getEmail(db: DbOrTx, id: number): Promise<EmailRow | null> {
  const [row] = await db.select(EMAIL_COLUMNS).from(emails).where(eq(emails.id, id));
  return row ? asEmail(row) : null;
}

/** The same row, locked until the transaction ends: Send reads it this way so two Sends can't both find a draft. */
export async function lockEmail(tx: DbOrTx, id: number): Promise<EmailRow | null> {
  const [row] = await tx.select(EMAIL_COLUMNS).from(emails).where(eq(emails.id, id)).for("update");
  return row ? asEmail(row) : null;
}

/**
 * The outer email's id inside a correlated subquery, spelled out with its
 * table. A bare ${emails.id} is written as just "id" in a one-table
 * statement, which inside the subquery would mean the delivery's own id.
 */
const EMAIL_ID = sql.raw('"emails"."id"');

const countOf = (status: DeliveryStatus | "waiting") =>
  sql<number>`(select count(*) from ${emailDeliveries} d where d.email_id = ${EMAIL_ID} and not d.test and ${status === "waiting" ? sql`d.status in ('queued', 'sending')` : sql`d.status = ${status}`})::int`;

export type EmailListRow = EmailRow & EmailCounts & { firstReason: string | null };

/** Every email, newest first, with its recipients counted. */
export async function listEmails(db: DbOrTx, limit = 300): Promise<EmailListRow[]> {
  const rows = await db
    .select({
      ...EMAIL_COLUMNS,
      sent: countOf("sent"),
      failed: countOf("failed"),
      leftOut: countOf("left_out"),
      waiting: countOf("waiting"),
      firstReason: sql<string | null>`(select d.reason from ${emailDeliveries} d where d.email_id = ${EMAIL_ID} and not d.test and d.status = 'failed' order by d.id limit 1)`,
    })
    .from(emails)
    .orderBy(desc(sql`coalesce(${emails.sentAt}, ${emails.updatedAt})`), desc(emails.id))
    .limit(limit);
  return rows.map((r) => ({ ...asEmail(r), sent: Number(r.sent), failed: Number(r.failed), leftOut: Number(r.leftOut), waiting: Number(r.waiting), firstReason: r.firstReason }));
}

/** An email's recipients (tests last), each with the account's current name where there still is one. */
export async function listDeliveries(db: DbOrTx, emailId: number): Promise<(DeliveryRow & { name: string | null })[]> {
  const rows = await db
    .select({ ...DELIVERY_COLUMNS, firstName: user.firstName, lastName: user.lastName })
    .from(emailDeliveries)
    .leftJoin(user, eq(user.id, emailDeliveries.userId))
    .where(eq(emailDeliveries.emailId, emailId))
    .orderBy(asc(emailDeliveries.test), asc(emailDeliveries.id));
  return rows.map(({ firstName, lastName, ...r }) => ({ ...asDelivery(r), name: [firstName, lastName].filter(Boolean).join(" ") || r.greetedAs || null }));
}

export interface NewDelivery {
  userId: string | null;
  address: string;
  greetedAs: string | null;
  posted: boolean;
  status: "queued" | "left_out";
  reason?: string | null;
  overridden?: boolean;
}

/** Send, confirmed: the draft becomes `sending` and its recipients are written, in the caller's transaction (which holds lockEmail). */
export async function startSending(tx: DbOrTx, id: number, send: { sender: EmailSender; toLabel: string; deliveries: NewDelivery[]; now: Date }): Promise<void> {
  await tx.update(emails).set({ status: "sending", sender: send.sender, toLabel: send.toLabel, sentAt: send.now }).where(eq(emails.id, id));
  for (let i = 0; i < send.deliveries.length; i += 500) {
    await tx.insert(emailDeliveries).values(send.deliveries.slice(i, i + 500).map((d) => ({ emailId: id, userId: d.userId, address: d.address, greetedAs: d.greetedAs, posted: d.posted, status: d.status, reason: d.reason ?? null, overridden: d.overridden ?? false })));
  }
}

/** A test to the admin, written as one recipient would get it: recorded, never counted. */
export async function recordTest(db: DbOrTx, emailId: number, t: { address: string; greetedAs: string | null; ok: boolean; providerId: string | null; error: string | null; now: Date }): Promise<void> {
  await db.insert(emailDeliveries).values({ emailId, address: t.address, greetedAs: t.greetedAs, test: true, status: t.ok ? "sent" : "failed", reason: t.error, providerId: t.providerId, attempts: 1, lastAttemptAt: t.now, sentAt: t.ok ? t.now : null });
}

/** How long a recipient waits before try number `attempts + 1`: none, then five minutes for each try already made. */
export const RETRY_AFTER_MS = 5 * 60_000;

/**
 * Takes the next recipient to send to and marks it `sending`, or returns
 * null when none is ready. One statement, and SKIP LOCKED, so two drains of
 * the same email (the request that sent it and the hourly cron) never take
 * the same row. Comes back with whether the account may be mailed now, since
 * someone can be banned or unsubscribe after the list was frozen.
 */
export async function claimDelivery(db: DbOrTx, emailId: number, now: Date): Promise<(DeliveryRow & { banned: boolean; stopEmail: boolean }) | null> {
  const [row] = await db
    .update(emailDeliveries)
    .set({ status: "sending", attempts: sql`${emailDeliveries.attempts} + 1`, lastAttemptAt: now })
    .where(
      eq(
        emailDeliveries.id,
        sql`(select d.id from ${emailDeliveries} d where d.email_id = ${emailId} and d.status = 'queued' and not d.test
              and (d.attempts = 0 or d.last_attempt_at <= ${new Date(now.getTime()).toISOString()}::timestamptz - (d.attempts * ${RETRY_AFTER_MS / 1000}) * interval '1 second')
              order by d.id limit 1 for update skip locked)`,
      ),
    )
    .returning(DELIVERY_COLUMNS);
  if (!row) return null;
  const d = asDelivery(row);
  if (!d.userId) return { ...d, banned: false, stopEmail: false };
  const [u] = await db.select({ banned: user.banned, noEmail: user.noEmail }).from(user).where(eq(user.id, d.userId));
  return { ...d, banned: Boolean(u?.banned), stopEmail: Boolean(u?.noEmail) };
}

export type DeliveryOutcome = { status: "sent"; providerId: string | null; now: Date } | { status: "failed"; reason: string } | { status: "queued"; reason: string } | { status: "left_out"; reason: string };

export async function settleDelivery(db: DbOrTx, id: number, o: DeliveryOutcome): Promise<void> {
  await db
    .update(emailDeliveries)
    .set(o.status === "sent" ? { status: "sent", providerId: o.providerId, sentAt: o.now, reason: null } : { status: o.status, reason: o.reason })
    .where(eq(emailDeliveries.id, id));
}

/** A recipient left `sending` (the function died mid-send) goes back to the queue: it is sent again under the same provider key, which can't deliver twice. */
export async function requeueStale(db: DbOrTx, before: Date): Promise<number> {
  const rows = await db
    .update(emailDeliveries)
    .set({ status: "queued" })
    .where(and(eq(emailDeliveries.status, "sending"), lt(emailDeliveries.lastAttemptAt, before)))
    .returning({ id: emailDeliveries.id });
  return rows.length;
}

/** How long the mail provider remembers an idempotency key, less an hour's margin: inside it, a second try can't deliver twice. */
export const PROVIDER_KEY_MS = 23 * 3_600_000;

/**
 * "Retry failed": the failed recipients of one email go back to the queue
 * with their tries counted afresh. Not the ones whose failure was never
 * confirmed (their reason starts with `unconfirmed`) once the provider has
 * forgotten the key: that try may have arrived, and another would be a
 * second copy. Those stay failed, for the admin to decide about.
 */
export async function requeueFailed(db: DbOrTx, emailId: number, unconfirmed: string, now: Date = new Date()): Promise<number> {
  const stale = new Date(now.getTime() - PROVIDER_KEY_MS).toISOString();
  const rows = await db
    .update(emailDeliveries)
    .set({ status: "queued", attempts: 0, reason: null })
    .where(
      and(
        eq(emailDeliveries.emailId, emailId),
        eq(emailDeliveries.status, "failed"),
        eq(emailDeliveries.test, false),
        sql`not (coalesce(${emailDeliveries.reason}, '') like ${`${unconfirmed}%`} and ${emailDeliveries.lastAttemptAt} < ${stale}::timestamptz)`,
      ),
    )
    .returning({ id: emailDeliveries.id });
  if (rows.length > 0) await db.update(emails).set({ status: "sending", finishedAt: null }).where(eq(emails.id, emailId));
  return rows.length;
}

/** Marks an email `sent` once nobody is queued or being sent to. True when it did. */
export async function finishIfDone(db: DbOrTx, emailId: number, now: Date): Promise<boolean> {
  const rows = await db
    .update(emails)
    .set({ status: "sent", finishedAt: now })
    .where(and(eq(emails.id, emailId), eq(emails.status, "sending"), sql`not exists (select 1 from ${emailDeliveries} d where d.email_id = ${EMAIL_ID} and not d.test and d.status in ('queued', 'sending'))`))
    .returning({ id: emails.id });
  return rows.length > 0;
}

/** Whether an email reached anyone: what decides that a reply settles its request. */
export async function reached(db: DbOrTx, emailId: number): Promise<boolean> {
  const [row] = await db.select({ id: emailDeliveries.id }).from(emailDeliveries).where(and(eq(emailDeliveries.emailId, emailId), eq(emailDeliveries.status, "sent"), eq(emailDeliveries.test, false))).limit(1);
  return Boolean(row);
}

export async function sendingEmailIds(db: DbOrTx): Promise<number[]> {
  return (await db.select({ id: emails.id }).from(emails).where(eq(emails.status, "sending")).orderBy(asc(emails.id))).map((r) => r.id);
}

export interface RequestReply {
  id: number;
  subject: string;
  body: string;
  /** Null while the reply is still a draft. */
  status: DeliveryStatus | null;
  reason: string | null;
  at: Date;
}

/** The replies written for each of these access requests, drafts included, newest first. */
export async function repliesForRequests(db: DbOrTx, requestIds: number[]): Promise<Map<number, RequestReply[]>> {
  const out = new Map<number, RequestReply[]>();
  if (requestIds.length === 0) return out;
  const rows = await db
    .select({ id: emails.id, requestId: emails.accessRequestId, subject: emails.subject, body: emails.body, status: emailDeliveries.status, reason: emailDeliveries.reason, at: sql<Date>`coalesce(${emails.sentAt}, ${emails.createdAt})`.mapWith(emails.createdAt) })
    .from(emails)
    .leftJoin(emailDeliveries, and(eq(emailDeliveries.emailId, emails.id), eq(emailDeliveries.test, false)))
    .where(inArray(emails.accessRequestId, requestIds))
    .orderBy(desc(emails.id));
  for (const { requestId, ...r } of rows) {
    if (requestId === null) continue;
    out.set(requestId, [...(out.get(requestId) ?? []), { ...r, status: r.status as DeliveryStatus | null }]);
  }
  return out;
}

/** An email written to this one address, sent or still a draft. */
const writtenTo = (address: string) => and(sql`${emails.audience}->>'kind' = 'address'`, sql`${emails.audience}->>'email' = ${address.toLowerCase()}`);

/** How many emails written to this one address would be deleted with their account (for the admin's delete confirmation). */
export async function countEmailsTo(db: DbOrTx, address: string): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(emails).where(writtenTo(address));
  return Number(r?.n ?? 0);
}

/**
 * An account is being deleted. An email written to that one person goes
 * with them, drafts included; their row in a group email stays, so its
 * totals still add up, but loses the address and the name. Call it before
 * the account row goes.
 */
export async function forgetRecipient(db: DbOrTx, address: string): Promise<void> {
  await db.delete(emails).where(writtenTo(address));
  await db.update(emailDeliveries).set({ address: null, greetedAs: null }).where(eq(emailDeliveries.address, address.toLowerCase()));
}
