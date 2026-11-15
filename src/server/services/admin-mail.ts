import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { render } from "@react-email/components";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { accessRequests } from "@/db/schema";
import AdminMessageEmail, { adminMessageText } from "@/emails/admin-message";
import { type AdminMailContent, adminMailContent, adminMailInput, fieldErrors } from "@/lib/admin-mail";
import { appSecret } from "@/lib/share";
import { approveAccessRequest, dismissAccessRequest } from "@/server/data/access-requests";
import { claimAdminMessage, messageByKey, releaseAdminMessage, retakeStalePending, settleAdminMessage } from "@/server/data/admin-messages";
import { sendMail } from "@/server/email/send";
import { log } from "@/server/log";
import { RATE_LIMITS, takeRateLimit } from "@/server/rate-limit";

/**
 * The admin's one-off email: preview, then send. A preview returns the
 * rendered message and a token bound to the admin and to the exact
 * recipient, subject and body; Send refuses anything without a token for what
 * it is sending, so a change after the preview needs a new one. The token's
 * nonce is the idempotency key, both in admin_messages (unique) and at
 * Resend, so one preview is one email however often Send is pressed. A send
 * whose request died mid-flight leaves its row pending; after
 * RETRY_PENDING_AFTER_MS the same preview may try again under the same key,
 * which Resend dedupes if the first attempt did reach it.
 *
 * Nothing here logs an address, a subject or a body: only row and request ids.
 */

/** How long a pending row must sit before Send may take it over and try again. */
export const RETRY_PENDING_AFTER_MS = 5 * 60_000;

export type MailResult<T> = { ok: true; data: T } | { ok: false; error: string; fieldErrors?: Record<string, string> };

function contentDigest(c: AdminMailContent): string {
  return createHash("sha256").update(JSON.stringify([c.to, c.subject, c.body])).digest("hex");
}

function mac(adminId: string, nonce: string, c: AdminMailContent): Buffer {
  return createHmac("sha256", appSecret()).update(`admin-mail:${adminId}:${nonce}:${contentDigest(c)}`).digest();
}

export function previewToken(adminId: string, c: AdminMailContent, nonce = randomBytes(16).toString("hex")): string {
  return `${nonce}.${mac(adminId, nonce, c).toString("hex")}`;
}

/** The token's nonce when it was issued to this admin for exactly this content; null otherwise. */
export function verifyPreviewToken(adminId: string, c: AdminMailContent, token: string): string | null {
  const m = /^([a-f0-9]{32})\.([a-f0-9]{64})$/.exec(token);
  if (!m) return null;
  const given = Buffer.from(m[2], "hex");
  return timingSafeEqual(given, mac(adminId, m[1], c)) ? m[1] : null;
}

/** The rendered email, as the recipient will see it, and the token Send needs. */
export async function previewAdminMessage(adminId: string, raw: unknown): Promise<MailResult<{ html: string; text: string; token: string }>> {
  const parsed = adminMailContent.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Check the fields marked below.", fieldErrors: fieldErrors(parsed.error) };
  const c = parsed.data;
  const html = await render(AdminMessageEmail({ body: c.body }));
  return { ok: true, data: { html, text: adminMessageText(c.body), token: previewToken(adminId, c) } };
}

export interface SendOutcome {
  messageId: number;
  /** True when this preview had already been sent: nothing went out this time. */
  duplicate: boolean;
  /** What happened to the access request: done as asked, or it had been handled already. */
  resolved: "approved" | "declined" | "already_handled" | null;
}

export async function sendAdminMessage(db: Db, adminId: string, raw: unknown, token: string): Promise<MailResult<SendOutcome>> {
  const parsed = adminMailInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Check the fields marked below.", fieldErrors: fieldErrors(parsed.error) };
  const input = parsed.data;

  const nonce = typeof token === "string" ? verifyPreviewToken(adminId, input, token) : null;
  if (!nonce) return { ok: false, error: "Preview this exact message before sending it." };

  if (input.accessRequestId) {
    const [req] = await db.select({ id: accessRequests.id }).from(accessRequests).where(eq(accessRequests.id, input.accessRequestId));
    if (!req) return { ok: false, error: "That access request is gone." };
  }

  const key = `admin-message/${nonce}`;
  const claimed = await claimAdminMessage(db, {
    senderId: adminId,
    recipient: input.to,
    subject: input.subject,
    body: input.body,
    idempotencyKey: key,
    accessRequestId: input.accessRequestId,
  });
  let id: number;
  if (claimed !== null) {
    // Counted before the send, so failed sends count too.
    const limited = await rateLimited(db, adminId);
    if (limited) {
      await releaseAdminMessage(db, claimed);
      return limited;
    }
    id = claimed;
  } else {
    const prev = await messageByKey(db, key);
    if (!prev) return { ok: false, error: "That message is still sending." };
    if (prev.status === "sent") return { ok: true, data: { messageId: prev.id, duplicate: true, resolved: null } };
    if (prev.status === "failed") return { ok: false, error: "That send failed already. Preview again to retry." };
    const staleBefore = new Date(Date.now() - RETRY_PENDING_AFTER_MS);
    if (prev.attemptedAt >= staleBefore) return { ok: false, error: "That message is still sending. If it doesn't show as sent in a few minutes, press Send again." };
    const limited = await rateLimited(db, adminId);
    if (limited) return limited;
    if (!(await retakeStalePending(db, prev.id, staleBefore))) return { ok: false, error: "That message is still sending." };
    log.info("admin_mail.retry_pending", { ref: prev.id });
    id = prev.id;
  }

  const sent = await sendMail({
    to: input.to,
    subject: input.subject,
    react: AdminMessageEmail({ body: input.body }),
    text: adminMessageText(input.body),
    kind: "admin_message",
    ref: id,
    idempotencyKey: key,
  });
  if (!sent.ok) {
    const error = sent.error ?? "The send failed.";
    await settleAdminMessage(db, id, { status: "failed", error });
    log.warn("admin_mail.failed", { ref: id, request: input.accessRequestId ?? undefined });
    return { ok: false, error: `Not sent: ${error}` };
  }
  await settleAdminMessage(db, id, { status: "sent", resendId: sent.id ?? null });
  log.info("admin_mail.sent", { ref: id, request: input.accessRequestId ?? undefined });

  let resolved: SendOutcome["resolved"] = null;
  if (input.accessRequestId && input.resolve === "approve") {
    resolved = (await approveAccessRequest(db, input.accessRequestId, adminId)) ? "approved" : "already_handled";
  } else if (input.accessRequestId && input.resolve === "decline") {
    resolved = (await dismissAccessRequest(db, input.accessRequestId)) ? "declined" : "already_handled";
  }
  if (resolved) log.info("admin_mail.request_resolved", { ref: id, request: input.accessRequestId ?? undefined, resolved });
  return { ok: true, data: { messageId: id, duplicate: false, resolved } };
}

/** One hit on the admin's hourly limit; the refusal to return, or null to go ahead. */
async function rateLimited(db: Db, adminId: string): Promise<{ ok: false; error: string } | null> {
  const limit = await takeRateLimit(db, RATE_LIMITS.adminMailPerUser, adminId);
  if (limit.allowed) return null;
  log.warn("admin_mail.rate_limited", { retryAfter: limit.retryAfterSeconds });
  return { ok: false, error: `That's ${RATE_LIMITS.adminMailPerUser.limit} emails this hour. Try again in ${Math.ceil(limit.retryAfterSeconds / 60)} min.` };
}
