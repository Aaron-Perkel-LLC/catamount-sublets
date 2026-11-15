import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { adminMessages, user } from "@/db/schema";
import type { AdminMailStatus } from "@/lib/admin-mail";

/** The admin's record of a one-off email. Admin only: it holds the address and the text. */
export interface AdminMessageRow {
  id: number;
  recipient: string;
  subject: string;
  body: string;
  status: AdminMailStatus;
  error: string | null;
  accessRequestId: number | null;
  createdAt: Date;
}

const columns = {
  id: adminMessages.id,
  recipient: adminMessages.recipient,
  subject: adminMessages.subject,
  body: adminMessages.body,
  status: adminMessages.status,
  error: adminMessages.error,
  accessRequestId: adminMessages.accessRequestId,
  createdAt: adminMessages.createdAt,
};

/**
 * Claims a send: writes the row as pending under the preview's idempotency
 * key. Null when that key already has a row (a double click, a retried
 * request), so one preview is never sent twice.
 */
export async function claimAdminMessage(
  db: DbOrTx,
  v: { senderId: string; recipient: string; subject: string; body: string; idempotencyKey: string; accessRequestId: number | null },
): Promise<number | null> {
  const [row] = await db
    .insert(adminMessages)
    .values({ ...v, recipient: v.recipient.trim().toLowerCase() })
    .onConflictDoNothing({ target: adminMessages.idempotencyKey }).returning({ id: adminMessages.id });
  return row?.id ?? null;
}

export async function messageByKey(db: DbOrTx, idempotencyKey: string): Promise<{ id: number; status: AdminMailStatus; attemptedAt: Date } | null> {
  const [row] = await db
    .select({ id: adminMessages.id, status: adminMessages.status, attemptedAt: adminMessages.attemptedAt })
    .from(adminMessages)
    .where(eq(adminMessages.idempotencyKey, idempotencyKey));
  return row ? { ...row, status: row.status as AdminMailStatus } : null;
}

/**
 * Takes over a row stuck in pending since before `staleBefore` (the request
 * that claimed it died mid-send), for a retry under the same key. True for
 * the one caller that wins it.
 */
export async function retakeStalePending(db: DbOrTx, id: number, staleBefore: Date): Promise<boolean> {
  const rows = await db
    .update(adminMessages)
    .set({ attemptedAt: new Date() })
    .where(and(eq(adminMessages.id, id), eq(adminMessages.status, "pending"), lt(adminMessages.attemptedAt, staleBefore)))
    .returning({ id: adminMessages.id });
  return rows.length === 1;
}

/** The daily sweep: a row pending since before `before` was interrupted and will not settle on its own. */
export async function failStalePending(db: DbOrTx, before: Date): Promise<number> {
  const rows = await db
    .update(adminMessages)
    .set({ status: "failed", error: "interrupted" })
    .where(and(eq(adminMessages.status, "pending"), lt(adminMessages.attemptedAt, before)))
    .returning({ id: adminMessages.id });
  return rows.length;
}

/** Settles a pending row once Resend has answered. */
export async function settleAdminMessage(db: DbOrTx, id: number, outcome: { status: "sent"; resendId: string | null } | { status: "failed"; error: string }): Promise<void> {
  await db
    .update(adminMessages)
    .set(outcome.status === "sent" ? { status: "sent", resendId: outcome.resendId, error: null } : { status: "failed", error: outcome.error })
    .where(and(eq(adminMessages.id, id), eq(adminMessages.status, "pending")));
}

/** Drops a claim that never reached Resend (the rate limit refused it), so the same preview can be sent later. */
export async function releaseAdminMessage(db: DbOrTx, id: number): Promise<void> {
  await db.delete(adminMessages).where(and(eq(adminMessages.id, id), eq(adminMessages.status, "pending")));
}

/** The newest sends, for the Mail section. */
export async function recentAdminMessages(db: DbOrTx, limit = 100): Promise<AdminMessageRow[]> {
  const rows = await db.select(columns).from(adminMessages).orderBy(desc(adminMessages.id)).limit(limit);
  return rows.map((r) => ({ ...r, status: r.status as AdminMailStatus }));
}

/** Every send answering each of these requests, newest first. */
export async function adminMessagesForRequests(db: DbOrTx, requestIds: number[]): Promise<Map<number, AdminMessageRow[]>> {
  const out = new Map<number, AdminMessageRow[]>();
  if (requestIds.length === 0) return out;
  const rows = await db.select(columns).from(adminMessages).where(inArray(adminMessages.accessRequestId, requestIds)).orderBy(desc(adminMessages.id));
  for (const r of rows) {
    const list = out.get(r.accessRequestId!) ?? [];
    list.push({ ...r, status: r.status as AdminMailStatus });
    out.set(r.accessRequestId!, list);
  }
  return out;
}

/** For account deletion: what the admin wrote to this address goes with the account. */
export async function deleteAdminMessagesTo(db: DbOrTx, email: string): Promise<number> {
  const rows = await db.delete(adminMessages).where(recipientIs(email)).returning({ id: adminMessages.id });
  return rows.length;
}

export async function countAdminMessagesTo(db: DbOrTx, email: string): Promise<number> {
  const rows = await db.select({ id: adminMessages.id }).from(adminMessages).where(recipientIs(email));
  return rows.length;
}

/** Whether this address is an account that asked for no email (the People tab's Stop email). */
export async function recipientOptedOut(db: DbOrTx, email: string): Promise<boolean> {
  const [row] = await db
    .select({ noEmail: user.noEmail })
    .from(user)
    .where(sql`${user.email} = ${email.trim().toLowerCase()}`);
  return Boolean(row?.noEmail);
}

/** Case-insensitive, on the lower(recipient) index. */
function recipientIs(email: string) {
  return sql`lower(${adminMessages.recipient}) = ${email.trim().toLowerCase()}`;
}
