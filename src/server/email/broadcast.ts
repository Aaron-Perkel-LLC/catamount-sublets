import { SITE } from "@/config/site";
import BroadcastEmail from "@/emails/broadcast";
import { sendMail } from "./send";

export interface Recipient {
  email: string;
  /** Their first name, or null to greet them without one (never by their login). */
  name: string | null;
  /** Whether they have a listing, which decides what the footer says they signed up for. */
  posted: boolean;
}

/**
 * Bulk mail to posters or account holders, one message per person, paced so it never sits in
 * front of a sign-in code (codes are sent directly by the auth hook, not
 * through this). `{name}` in the body is the person's name; without the
 * placeholder a "Hi <name>," line is added. A copy listing the recipients
 * goes to the support address.
 */
export async function sendBroadcast(
  recipients: Recipient[],
  subject: string,
  body: string,
  options: { pauseMs?: number } = {},
): Promise<{ sent: number; failed: number }> {
  const paragraphsOf = (text: string) =>
    text
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);
  let sent = 0;
  let failed = 0;
  for (const [i, r] of recipients.entries()) {
    const name = r.name?.trim() || null;
    const personal = body.includes("{name}") ? body.replaceAll("{name}", name ?? "there") : body;
    const greeting = body.includes("{name}") ? null : name ? `Hi ${name},` : "Hi,";
    const result = await sendMail({
      to: r.email,
      subject,
      react: BroadcastEmail({ paragraphs: paragraphsOf(personal), greeting, posted: r.posted }),
      kind: "broadcast",
      ref: i,
    });
    if (result.ok) sent++;
    else failed++;
    if (options.pauseMs && i < recipients.length - 1) await new Promise((res) => setTimeout(res, options.pauseMs));
  }
  await sendMail({
    to: SITE.supportEmail,
    subject: `[Copy] ${subject}`,
    react: BroadcastEmail({
      greeting: null,
      posted: false,
      paragraphs: [
        `Sent to ${sent} ${sent === 1 ? "person" : "people"}${failed ? `, ${failed} failed` : ""}: ${recipients.map((r) => r.email).join(", ")}`,
        ...body
          .replaceAll("{name}", "{name}")
          .split(/\n\s*\n/)
          .map((p) => p.trim())
          .filter(Boolean),
      ],
    }),
    kind: "broadcast_copy",
  });
  return { sent, failed };
}
