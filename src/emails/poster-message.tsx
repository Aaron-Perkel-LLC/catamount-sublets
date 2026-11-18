import { Link, Section, Text } from "@react-email/components";
import { Fragment } from "react";
import { ACCESS, SITE } from "@/config/site";
import { paragraphsOf } from "@/lib/admin-mail";
import { easternYear } from "@/lib/dates";
import { EMAIL_COLOURS, EmailLayout, muted, paragraph } from "./layout";

/**
 * A message a community account (an address outside the schools) sent a
 * poster through the site's relay (src/server/services/poster-message.ts).
 * Sent from the updates subdomain with Reply-To set to the sender, so a reply
 * goes straight to them. The sender's text is only ever text nodes and <br>s:
 * no links are made from it, and the relay refuses messages that hold one.
 * The listing is named by price and semester, never the address.
 */

export interface PosterMessageProps {
  senderName: string;
  senderEmail: string;
  body: string;
  /** "$850/mo · Spring 2027": the share card's words, never the address. */
  listingLine: string;
  /** Where the poster turns these messages off: My post. */
  settingsUrl: string;
}

export const SCAM_WARNING =
  "Never send money or a deposit before you've seen the place in person and met the person you're dealing with. We don't check who people outside the schools are.";

export function posterMessageSubject(senderName: string): string {
  return `${senderName} sent a message about your sublet (from someone ${ACCESS.outside})`;
}

const FOOTER = `Sent by ${SITE.name} (${SITE.domain}) on behalf of the person named above. ${SITE.disclaimer}`;

export default function PosterMessageEmail({ senderName, senderEmail, body, listingLine, settingsUrl }: PosterMessageProps) {
  const paragraphs = paragraphsOf(body);
  return (
    <EmailLayout preview={`From someone ${ACCESS.outside}: ${paragraphs[0]?.join(" ") ?? ""}`} footer={FOOTER}>
      <Text style={{ ...muted, margin: "0 0 6px", fontWeight: 700, color: EMAIL_COLOURS.maple }}>From someone {ACCESS.outside}</Text>
      <Text style={paragraph}>
        <strong>{senderName}</strong> ({senderEmail}) wrote to you about your listing ({listingLine}). Reply to this email to answer them: your
        reply goes straight to them and shows them your email address.
      </Text>
      <Section style={{ borderLeft: `3px solid ${EMAIL_COLOURS.line}`, padding: "2px 0 2px 14px", margin: "0 0 16px" }}>
        {paragraphs.map((lines, i) => (
          <Text key={i} style={{ ...paragraph, margin: "0 0 10px" }}>
            {lines.map((line, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {line}
              </Fragment>
            ))}
          </Text>
        ))}
      </Section>
      <Section style={{ backgroundColor: EMAIL_COLOURS.cream, borderRadius: 8, padding: "10px 14px", margin: "0 0 16px" }}>
        <Text style={{ ...muted, margin: 0, color: EMAIL_COLOURS.ink }}>
          <strong>Be careful.</strong> {SCAM_WARNING}
        </Text>
      </Section>
      <Text style={muted}>
        Don&apos;t want messages from people {ACCESS.outside}? Turn them off on{" "}
        <Link href={settingsUrl} style={{ color: EMAIL_COLOURS.lake, fontWeight: 700 }}>
          My post
        </Link>
        .
      </Text>
    </EmailLayout>
  );
}

/** The plain-text part, written out so the sender's words come through exactly. */
export function posterMessageText(p: PosterMessageProps): string {
  const body = paragraphsOf(p.body)
    .map((lines) => lines.map((l) => `> ${l}`).join("\n"))
    .join("\n>\n");
  return (
    [
      `From someone ${ACCESS.outside}`,
      `${p.senderName} (${p.senderEmail}) wrote to you about your listing (${p.listingLine}). Reply to this email to answer them: your reply goes straight to them and shows them your email address.`,
      body,
      `Be careful. ${SCAM_WARNING}`,
      `Don't want messages from people ${ACCESS.outside}? Turn them off on My post: ${p.settingsUrl}`,
      `--\n${FOOTER}\n${SITE.name} · © ${easternYear()} ${SITE.operator}`,
    ].join("\n\n") + "\n"
  );
}

PosterMessageEmail.PreviewProps = {
  senderName: "Robin Lee",
  senderEmail: "robin@example.com",
  body: "Hi! I'm starting a job in Burlington in January and need a place through May.\n\nIs the room still free, and could I see it next week?",
  listingLine: "$850/mo · Spring 2027",
  settingsUrl: "https://catamountsublets.com/post",
} satisfies PosterMessageProps;
