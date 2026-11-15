import { z } from "zod";
import { ACCESS, SITE } from "@/config/site";

/**
 * The admin's one-off email: one recipient, a subject, and a plain-text body
 * that the template turns into paragraphs with links. One schema for the
 * composer (inline messages) and the Server Actions (the truth).
 */

export const ADMIN_MAIL_LIMITS = { email: 254, subject: 200, body: 10_000 } as const;
export const ADMIN_MAIL_RESOLUTIONS = ["approve", "decline"] as const;
export type AdminMailResolution = (typeof ADMIN_MAIL_RESOLUTIONS)[number];
export const ADMIN_MAIL_STATUSES = ["pending", "sent", "failed"] as const;
export type AdminMailStatus = (typeof ADMIN_MAIL_STATUSES)[number];

const EMAIL = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;

/** What the email says and who it goes to: the part a preview is bound to. */
export const adminMailContent = z.object({
  to: z
    .string()
    .trim()
    .toLowerCase()
    .max(ADMIN_MAIL_LIMITS.email, "That address is too long.")
    .refine((v) => EMAIL.test(v), "Enter one valid email address."),
  subject: z
    .string()
    .trim()
    .min(1, "Write a subject.")
    .max(ADMIN_MAIL_LIMITS.subject, `Keep the subject under ${ADMIN_MAIL_LIMITS.subject} characters.`)
    .refine((v) => !/[\r\n]/.test(v), "The subject is one line."),
  body: z
    .string()
    .transform((v) => v.replace(/\r\n?/g, "\n").trim())
    .pipe(
      z
        .string()
        .min(1, "Write the message.")
        .max(ADMIN_MAIL_LIMITS.body, `Keep the message under ${ADMIN_MAIL_LIMITS.body.toLocaleString("en-US")} characters.`),
    ),
});
export type AdminMailContent = z.infer<typeof adminMailContent>;

/** The whole send: the content, plus the access request it answers and what to do with that request once sent. */
export const adminMailInput = adminMailContent
  .extend({
    accessRequestId: z.number().int().positive().nullable().default(null),
    resolve: z.enum(ADMIN_MAIL_RESOLUTIONS).nullable().default(null),
  })
  .refine((v) => !v.resolve || v.accessRequestId, { path: ["resolve"], message: "Only a reply to a request can approve or decline it." });
export type AdminMailInput = z.infer<typeof adminMailInput>;

/** The first message for each field, keyed by field name. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}

/* ------------------------------------------------------------ starting points for a reply */

export type ReplyStarter = "approved" | "declined" | "blank";

export interface RequestForReply {
  kind: string;
  name: string;
  email: string;
  school: string | null;
}

export function replySubject(r: RequestForReply): string {
  return r.kind === "school" ? `Your school request on ${SITE.name}` : `Your access request on ${SITE.name}`;
}

/** The editable first draft of a reply. Greets by first name; never signs off (the template does). */
export function replyBody(r: RequestForReply, starter: ReplyStarter): string {
  const first = r.name.trim().split(/\s+/)[0] || "";
  const hi = `Hi${first ? ` ${first}` : ""},`;
  if (starter === "blank") return `${hi}\n\n`;
  if (starter === "approved") {
    return [
      hi,
      `Thanks for writing. I've approved ${r.email}, so you can sign in now at ${SITE.url}/sign-in: enter that address and a six-digit code is emailed to you. The first time in, it asks for your name.`,
      "If the code doesn't arrive within a minute, check Junk and mark it as not junk so the next one lands in your inbox.",
      "Any questions, just reply to this email.",
    ].join("\n\n");
  }
  const reason =
    r.kind === "school" && r.school
      ? `For now ${SITE.name} is only open to ${ACCESS.audience}, and I'm not able to add ${r.school} yet.`
      : `For now ${SITE.name} is only open to ${ACCESS.audience}, so I'm not able to open an account for ${r.email}.`;
  return [hi, `Thanks for asking, and sorry for the wait. ${reason}`, "If that changes I'll let you know. If I've got your situation wrong, reply and tell me more."].join("\n\n");
}

/* ------------------------------------------------------------ body text → paragraphs and links */

export type Inline = { kind: "text"; text: string } | { kind: "link"; text: string; href: string };

/** Paragraphs are blank-line separated; each is a list of its lines. */
export function paragraphsOf(body: string): string[][] {
  return body
    .replace(/\r\n?/g, "\n")
    .split(/\n[ \t]*\n/)
    .map((p) => p.split("\n").map((l) => l.trimEnd()))
    .map((lines) => {
      while (lines.length && !lines[0].trim()) lines.shift();
      while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
      return lines;
    })
    .filter((lines) => lines.length > 0);
}

const LINKISH = /(?:https?:\/\/|www\.)[^\s<>"]+|[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

/** Trailing punctuation belongs to the sentence, not the link; a ")" stays only when the link opened one. */
function trimLink(raw: string): string {
  let s = raw;
  for (;;) {
    const last = s.at(-1);
    if (!last) return s;
    if (".,;:!?'\"".includes(last)) s = s.slice(0, -1);
    else if (last === ")" && (s.match(/\(/g)?.length ?? 0) < (s.match(/\)/g)?.length ?? 0)) s = s.slice(0, -1);
    else return s;
  }
}

/**
 * Splits one line into text and links: http(s) and www. addresses, and email
 * addresses (as mailto:). Nothing else becomes a link, and nothing is ever
 * HTML: the template renders each piece as a text node or an <a>.
 */
export function linkify(line: string): Inline[] {
  const out: Inline[] = [];
  let at = 0;
  for (const m of line.matchAll(LINKISH)) {
    const text = trimLink(m[0]);
    if (!text || (text.startsWith("www.") && !text.slice(4).includes("."))) continue;
    const start = m.index;
    if (start > at) out.push({ kind: "text", text: line.slice(at, start) });
    const href = /^https?:\/\//i.test(text) ? text : text.startsWith("www.") ? `https://${text}` : `mailto:${text}`;
    out.push({ kind: "link", text, href });
    at = start + text.length;
  }
  if (at < line.length) out.push({ kind: "text", text: line.slice(at) });
  return out;
}
