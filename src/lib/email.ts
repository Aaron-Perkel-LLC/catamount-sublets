import { z } from "zod";
import { ACCESS, SITE } from "@/config/site";

/**
 * Email the admin writes from the console: one email, to one address or to a
 * group, with a plain-text body that the template turns into paragraphs with
 * links. One set of schemas for the composer (inline messages) and the
 * Server Actions (the truth). Safe on both sides.
 */

export const EMAIL_LIMITS = { email: 254, subject: 200, body: 10_000, people: 5000 } as const;
export const EMAIL_STATUSES = ["draft", "sending", "sent"] as const;
export type EmailStatus = (typeof EMAIL_STATUSES)[number];
/** What happened to one recipient. `left_out` never had a send tried: banned, or marked Stop email. */
export const DELIVERY_STATUSES = ["queued", "sending", "sent", "failed", "left_out"] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];
export const EMAIL_RESOLUTIONS = ["approve", "decline"] as const;
export type EmailResolution = (typeof EMAIL_RESOLUTIONS)[number];
export const EMAIL_SENDERS = ["personal", "group"] as const;
export type EmailSender = (typeof EMAIL_SENDERS)[number];
export const LEFT_OUT_REASONS = { stop_email: "Stop email", banned: "Banned" } as const;
export type LeftOutReason = keyof typeof LEFT_OUT_REASONS;

/** In a body: the person's first name, and (accounts only) their own signed link to the survey. */
export const NAME_PLACEHOLDER = "{name}";
export const SURVEY_PLACEHOLDER = "{survey}";

const EMAIL = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;
export const isEmailAddress = (v: string) => EMAIL.test(v);

/**
 * Who an email is for, as chosen (not who that resolved to): one address, or
 * a group worked out again when it is sent. An address may be half-typed in
 * a draft; emailToSend below is what Send requires.
 */
export const emailAudience = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("address"), email: z.string().trim().toLowerCase().max(EMAIL_LIMITS.email, "That address is too long.") }),
  z.object({ kind: z.literal("board") }),
  z.object({ kind: z.literal("semester"), code: z.string().trim().min(1).max(40) }),
  z.object({ kind: z.literal("everyone") }),
  z.object({ kind: z.literal("survey") }),
  /** Posters brought over from the old site who have never signed in here and still have a listing: who the stale-listing cleanup removes (src/server/data/stale.ts). */
  z.object({ kind: z.literal("stale") }),
  z.object({ kind: z.literal("people"), userIds: z.array(z.string().uuid()).max(EMAIL_LIMITS.people) }),
]);
export type EmailAudience = z.infer<typeof emailAudience>;
export const isGroup = (a: EmailAudience): boolean => a.kind !== "address";

const body = z.string().transform((v) => v.replace(/\r\n?/g, "\n"));

/** A draft as it is saved while being written: nothing is required yet. */
export const emailDraft = z.object({
  subject: z.string().max(EMAIL_LIMITS.subject, `Keep the subject under ${EMAIL_LIMITS.subject} characters.`),
  body: body.pipe(z.string().max(EMAIL_LIMITS.body, `Keep the message under ${EMAIL_LIMITS.body.toLocaleString("en-US")} characters.`)),
  audience: emailAudience,
  resolve: z.enum(EMAIL_RESOLUTIONS).nullable().default(null),
});
export type EmailDraft = z.infer<typeof emailDraft>;

/** What Send requires of that draft. */
export const emailToSend = z
  .object({
  subject: z
    .string()
    .trim()
    .min(1, "Write a subject.")
    .max(EMAIL_LIMITS.subject, `Keep the subject under ${EMAIL_LIMITS.subject} characters.`)
    .refine((v) => !/[\r\n]/.test(v), "The subject is one line."),
  body: body.pipe(
    z
      .string()
      .trim()
      .min(1, "Write the message.")
      .max(EMAIL_LIMITS.body, `Keep the message under ${EMAIL_LIMITS.body.toLocaleString("en-US")} characters.`),
  ),
    audience: emailAudience,
  })
  .refine((v) => v.audience.kind !== "address" || isEmailAddress(v.audience.email), { path: ["email"], message: "Enter one valid email address." });

/** A group as the log and the composer name it; a semester by its name when there is one to hand. */
export function audienceLabel(a: EmailAudience, semesterNames: ReadonlyMap<string, string> = new Map()): string {
  switch (a.kind) {
    case "address":
      return a.email;
    case "board":
      return "Posters on the board";
    case "semester":
      return `${semesterNames.get(a.code) ?? a.code} posters`;
    case "everyone":
      return "Everyone with an account";
    case "survey":
      return "Haven't answered the survey";
    case "stale":
      return "Posters who haven't signed in since the move";
    case "people":
      return a.userIds.length === 1 ? "1 hand-picked person" : `${a.userIds.length} hand-picked people`;
  }
}

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
