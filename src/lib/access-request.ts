import { z } from "zod";

/**
 * "Request your school" and "Request access", from the front page. One schema
 * for the form (inline messages) and the Server Action (the truth). No account
 * is needed, so the address can be anyone's; it is only ever mailed to the
 * admin and stored for the reply.
 */

export const ACCESS_REQUEST_KINDS = ["school", "access"] as const;
export type AccessRequestKind = (typeof ACCESS_REQUEST_KINDS)[number];

export const ACCESS_REQUEST_LIMITS = { name: 80, email: 254, school: 120, message: 1000, messageMin: 10 } as const;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const text = (max: number, tooLong: string) => z.string().trim().max(max, tooLong);

export const accessRequestSchema = z
  .object({
    kind: z.enum(ACCESS_REQUEST_KINDS, "Pick what you're asking for."),
    name: text(ACCESS_REQUEST_LIMITS.name, "Keep your name under 80 characters.").min(1, "Enter your name."),
    email: text(ACCESS_REQUEST_LIMITS.email, "That email is too long.").refine((v) => EMAIL.test(v), "Enter an email we can reply to."),
    school: text(ACCESS_REQUEST_LIMITS.school, "Keep the school name under 120 characters."),
    message: text(ACCESS_REQUEST_LIMITS.message, "Keep it under 1,000 characters."),
    /** A field people never see; anything in it is a bot. */
    website: z.string().max(0, "Leave this empty."),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "school" && !v.school) ctx.addIssue({ code: "custom", path: ["school"], message: "Which school should we add?" });
    if (v.kind === "access" && v.message.length < ACCESS_REQUEST_LIMITS.messageMin) {
      ctx.addIssue({ code: "custom", path: ["message"], message: "Tell us a little about why you'd like access." });
    }
  });

export type AccessRequestInput = z.infer<typeof accessRequestSchema>;

export type AccessRequestCheck = { ok: true; data: AccessRequestInput } | { ok: false; fieldErrors: Record<string, string> };

export function parseAccessRequest(fd: FormData): AccessRequestCheck {
  const str = (k: string) => {
    const v = fd.get(k);
    return typeof v === "string" ? v : "";
  };
  const parsed = accessRequestSchema.safeParse({
    kind: str("kind"),
    name: str("name"),
    email: str("email"),
    school: str("school"),
    message: str("message"),
    website: str("website"),
  });
  if (parsed.success) return { ok: true, data: { ...parsed.data, email: parsed.data.email.toLowerCase() } };
  const fieldErrors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0] ?? "form");
    fieldErrors[key] ??= issue.message;
  }
  return { ok: false, fieldErrors };
}
