"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { emailAudience, emailDraft, EMAIL_LIMITS, replyBody, replySubject } from "@/lib/email";
import { requireAdmin } from "@/server/auth";
import { listPendingAccessRequests } from "@/server/data/access-requests";
import { createDraft, deleteDraft, getEmail, saveDraft } from "@/server/data/emails";
import { checkEmail, drain, type EmailCheck, type Rendered, type Result, retryFailed, sendTest, sentCopy, type SendStarted, startSend } from "@/server/services/email";

/**
 * The admin's email (src/server/services/email.ts): write, check, send.
 * requireAdmin() is the first line of every one, and every input is parsed.
 * Only adminEmailSend, adminEmailRetry and adminEmailTest ever hand anything
 * to the mail provider, and a test goes to the admin's own address alone.
 */

const id = z.number().int().positive();
const index = z.number().int().min(0).max(EMAIL_LIMITS.people);
const fresh = () => {
  revalidatePath("/admin/email", "layout");
  revalidatePath("/admin/requests");
};

const newEmail = z.union([
  z.object({ requestId: id }),
  z.object({ audience: emailAudience }),
  z.object({}).strict(),
]);

/** Starts a draft: blank, for a group chosen elsewhere (People), or as a reply to an access request with its starting text. */
export async function adminEmailNew(input: unknown): Promise<Result<{ id: number }>> {
  const me = await requireAdmin();
  const parsed = newEmail.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That isn't something to start an email from." };
  const db = await getDb();
  if ("requestId" in parsed.data) {
    const requestId = parsed.data.requestId;
    const req = (await listPendingAccessRequests(db)).find((r) => r.id === requestId);
    if (!req) return { ok: false, error: "That request has been handled already." };
    const draft = await createDraft(db, me.id, { audience: { kind: "address", email: req.email.toLowerCase() }, subject: replySubject(req), body: replyBody(req, "approved"), accessRequestId: req.id, resolve: "approve" });
    return { ok: true, data: { id: draft } };
  }
  const audience = "audience" in parsed.data ? parsed.data.audience : ({ kind: "address", email: "" } as const);
  return { ok: true, data: { id: await createDraft(db, me.id, { audience }) } };
}

/** Saves the draft as typed and answers with the check for it: who gets it, who doesn't, and recipient `at`'s email in full. */
export async function adminEmailSave(emailId: number, draft: unknown, at: number): Promise<Result<EmailCheck>> {
  await requireAdmin();
  const parsed = emailDraft.safeParse(draft);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "That can't be saved." };
  const db = await getDb();
  const e = await getEmail(db, id.parse(emailId));
  if (!e) return { ok: false, error: "That email is gone." };
  // Only a reply to a request can approve or decline it.
  const resolve = e.accessRequestId ? parsed.data.resolve : null;
  if (!(await saveDraft(db, e.id, { ...parsed.data, resolve }))) return { ok: false, error: "This email has already been sent. Reload to see it." };
  return checkEmail(db, e.id, index.parse(at));
}

/** The check alone, for stepping through recipients. */
export async function adminEmailCheck(emailId: number, at: number): Promise<Result<EmailCheck>> {
  await requireAdmin();
  return checkEmail(await getDb(), id.parse(emailId), index.parse(at));
}

export async function adminEmailDelete(emailId: number): Promise<Result> {
  await requireAdmin();
  const gone = await deleteDraft(await getDb(), id.parse(emailId));
  fresh();
  return gone ? { ok: true, data: undefined } : { ok: false, error: "Only a draft can be deleted." };
}

/** A test to the admin's own address, written as recipient `at` would get it. */
export async function adminEmailTest(emailId: number, at: number): Promise<Result<{ to: string; as: string }>> {
  const me = await requireAdmin();
  return sendTest(await getDb(), { id: me.id, email: me.email }, id.parse(emailId), index.parse(at));
}

const sendInput = z.object({ check: z.string().regex(/^[0-9a-f]{32}$/), typed: z.number().int().min(0).max(EMAIL_LIMITS.people).nullable(), sendAnyway: z.boolean() });

/**
 * Send, confirmed. The recipients are frozen and queued before this
 * answers; the sending itself runs after the response, so it doesn't depend
 * on the page staying open, and the hourly cron finishes anything it can't.
 */
export async function adminEmailSend(emailId: number, input: unknown): Promise<Result<SendStarted>> {
  const me = await requireAdmin();
  const parsed = sendInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the email again, then send." };
  const db = await getDb();
  const r = await startSend(db, me.id, id.parse(emailId), parsed.data);
  if (r.ok && !r.data.already) after(() => drain(db, emailId));
  fresh();
  return r;
}

/** "Retry failed": only the recipients this email failed to reach. */
export async function adminEmailRetry(emailId: number): Promise<Result<{ queued: number }>> {
  await requireAdmin();
  const db = await getDb();
  const r = await retryFailed(db, id.parse(emailId));
  if (r.ok) after(() => drain(db, emailId));
  fresh();
  return r;
}

/**
 * A sent email's words as a new draft, addressed as it was: to the same
 * person, or to the same group as it stands when that draft is sent. A group
 * that no longer exists (an old row's retired kind) starts as "One person…".
 */
export async function adminEmailCopy(emailId: number): Promise<Result<{ id: number }>> {
  const me = await requireAdmin();
  const db = await getDb();
  const e = await getEmail(db, id.parse(emailId));
  if (!e) return { ok: false, error: "That email is gone." };
  const audience = emailAudience.safeParse(e.audience);
  return { ok: true, data: { id: await createDraft(db, me.id, { audience: audience.success ? audience.data : { kind: "address", email: "" }, subject: e.subject, body: e.body }) } };
}

/** One recipient's copy of an email that has gone. */
export async function adminEmailCopyFor(emailId: number, deliveryId: number): Promise<Result<Rendered>> {
  await requireAdmin();
  return sentCopy(await getDb(), id.parse(emailId), id.parse(deliveryId));
}
