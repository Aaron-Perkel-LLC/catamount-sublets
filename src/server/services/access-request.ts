import { createElement } from "react";
import { ADMIN_INBOX, SITE } from "@/config/site";
import type { DbOrTx } from "@/db";
import AdminNoticeEmail from "@/emails/admin-notice";
import { parseAccessRequest } from "@/lib/access-request";
import { createAccessRequest } from "@/server/data/access-requests";
import { assertWritable, ReadOnlyError } from "@/server/data/settings";
import { sendMail } from "@/server/email/send";
import { log } from "@/server/log";
import { RATE_LIMITS, takeRateLimit } from "@/server/rate-limit";

export interface AccessRequestState {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

/**
 * A front-page request: validate, rate-limit by IP and by reply address,
 * store, then mail the admin with Reply-To set to the person. The row is the
 * record; a failed mail is logged by id and the person still sees success.
 */
export async function submitAccessRequest(db: DbOrTx, formData: FormData, ip: string): Promise<AccessRequestState> {
  const parsed = parseAccessRequest(formData);
  if (!parsed.ok) {
    // The honeypot gets a quiet "thanks": nothing stored, nothing to learn from.
    if (parsed.fieldErrors.website) return { ok: true };
    return { ok: false, error: "Check the fields marked below.", fieldErrors: parsed.fieldErrors };
  }
  const input = parsed.data;
  try {
    await assertWritable(db);
  } catch (error) {
    if (error instanceof ReadOnlyError) return { ok: false, error: error.message };
    throw error;
  }

  const perIp = await takeRateLimit(db, RATE_LIMITS.accessRequestPerIp, ip);
  const perEmail = await takeRateLimit(db, RATE_LIMITS.accessRequestPerEmail, input.email);
  if (!perIp.allowed || !perEmail.allowed) {
    log.warn("access_request.rate_limited", { byIp: !perIp.allowed, byEmail: !perEmail.allowed });
    return { ok: false, error: `That's a lot of requests in a short time. Try again later, or email ${SITE.supportEmail}.` };
  }

  const id = await createAccessRequest(db, input);
  const title = input.kind === "school" ? "School request" : "Access request";
  const sent = !ADMIN_INBOX ? { ok: false } : await sendMail({
    to: ADMIN_INBOX,
    subject: `${title} #${id}: ${input.kind === "school" ? input.school : input.name}`,
    kind: "access_request",
    replyTo: input.email,
    ref: id,
    react: createElement(AdminNoticeEmail, {
      title,
      intro: `${input.name} asked from the front page. Reply to this email to answer them.`,
      rows: [
        { label: "Name", after: input.name },
        { label: "Email", after: input.email },
        ...(input.school ? [{ label: input.kind === "school" ? "School" : "School or connection", after: input.school }] : []),
        { label: input.kind === "school" ? "Anything else" : "Their case", after: input.message || "—" },
      ],
    }),
  });
  if (!sent.ok) log.error("access_request.mail_failed", new Error("admin mail not sent"), { ref: id });
  else log.info("access_request.created", { ref: id, kind: input.kind });
  return { ok: true };
}
