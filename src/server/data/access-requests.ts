import { and, asc, eq, isNull } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { accessRequests } from "@/db/schema";
import type { AccessRequestInput } from "@/lib/access-request";
import { normalizeEmail } from "@/lib/auth-allow";
import { getSetting, setSetting } from "./settings";

/** Store one request from the front page; returns its id for the log and the admin mail. */
export async function createAccessRequest(db: DbOrTx, input: AccessRequestInput): Promise<number> {
  const [row] = await db
    .insert(accessRequests)
    .values({
      kind: input.kind,
      name: input.name,
      email: input.email,
      school: input.kind === "school" ? input.school : input.school || null,
      message: input.message,
    })
    .returning({ id: accessRequests.id });
  return row.id;
}

export interface PendingAccessRequest {
  id: number;
  kind: string;
  name: string;
  email: string;
  school: string | null;
  message: string;
  createdAt: Date;
}

/** Requests nobody has approved or dismissed yet, oldest first. Admin only. */
export async function listPendingAccessRequests(db: DbOrTx): Promise<PendingAccessRequest[]> {
  return db
    .select({
      id: accessRequests.id,
      kind: accessRequests.kind,
      name: accessRequests.name,
      email: accessRequests.email,
      school: accessRequests.school,
      message: accessRequests.message,
      createdAt: accessRequests.createdAt,
    })
    .from(accessRequests)
    .where(isNull(accessRequests.handledAt))
    .orderBy(asc(accessRequests.id));
}

/** Addresses outside the allowed domains that may sign in because the admin approved them. */
export async function approvedEmails(db: DbOrTx): Promise<string[]> {
  return (await getSetting(db, "approved_emails")).emails;
}

export async function isEmailApproved(db: DbOrTx, email: string): Promise<boolean> {
  return (await approvedEmails(db)).includes(normalizeEmail(email));
}

/** Marks a pending request handled; returns its address, or null when there is no such pending request. */
async function closeRequest(db: DbOrTx, id: number): Promise<string | null> {
  const [row] = await db
    .update(accessRequests)
    .set({ handledAt: new Date() })
    .where(and(eq(accessRequests.id, id), isNull(accessRequests.handledAt)))
    .returning({ email: accessRequests.email });
  return row ? normalizeEmail(row.email) : null;
}

/** Approve: the request is closed and its address may sign in from now on. Null when it was already handled or is gone. */
export async function approveAccessRequest(db: DbOrTx, id: number, adminId: string): Promise<string | null> {
  return db.transaction(async (tx) => {
    const email = await closeRequest(tx, id);
    if (!email) return null;
    const list = await approvedEmails(tx);
    if (!list.includes(email)) await setSetting(tx, "approved_emails", { emails: [...list, email] }, adminId);
    return email;
  });
}

/** Dismiss: closed without approving. False when it was already handled or is gone. */
export async function dismissAccessRequest(db: DbOrTx, id: number): Promise<boolean> {
  return (await closeRequest(db, id)) !== null;
}

/** Stops new sign-ins for an approved address. An existing account keeps its session; ban it in People to cut it off. */
export async function revokeApprovedEmail(db: DbOrTx, email: string, adminId: string): Promise<boolean> {
  const target = normalizeEmail(email);
  const list = await approvedEmails(db);
  if (!list.includes(target)) return false;
  await setSetting(db, "approved_emails", { emails: list.filter((e) => e !== target) }, adminId);
  return true;
}
