import { Link, Text } from "@react-email/components";
import { Fragment } from "react";
import { SITE } from "@/config/site";
import { easternYear } from "@/lib/dates";
import { linkify, paragraphsOf } from "@/lib/email";
import { EMAIL_COLOURS, EmailLayout, muted, paragraph } from "./layout";

/**
 * An email the admin wrote in the console, to one person or to a group
 * (src/server/services/email.ts). A personal note either way: no header
 * bar, signed by the author. The body is the admin's plain text, already
 * made out to this recipient: blank lines make paragraphs, single newlines
 * make line breaks, and web and email addresses become links. It is only
 * ever text nodes and <a>s, never HTML.
 *
 * A group email's footer says why the person is getting it and carries the
 * unsubscribe link and the postal address; an email to one person has
 * neither.
 */

export interface GroupFooter {
  /** The visible link: the confirm page, where unsubscribing takes a tap. */
  unsubscribeUrl: string;
  /** From emailMailingAddress() (server-only); the template never reads the environment. */
  mailingAddress: string;
  /** Whether they have a listing, which is why they are getting it. */
  posted: boolean;
}

const SIGN_OFF = ["Thanks,", SITE.author.split(" ")[0]] as const;
const DIRECT_FOOTER = `Sent from ${SITE.domain}. Reply to this email to reach me directly. ${SITE.disclaimer}`;
export const MAILING_ADDRESS_MISSING = "[mailing address not set]";
const why = (g: GroupFooter) => `You're getting this because you ${g.posted ? "posted a listing" : "have an account"} on ${SITE.domain}. Reply to this email to reach me directly.`;
const postal = (g: GroupFooter) => `${SITE.name}, ${g.mailingAddress || MAILING_ADDRESS_MISSING}`;

export default function AdminEmail({ body, group }: { body: string; group: GroupFooter | null }) {
  const paragraphs = paragraphsOf(body);
  const link = { color: EMAIL_COLOURS.lake, fontWeight: 700 } as const;
  const footerLink = { color: EMAIL_COLOURS.ink3, textDecoration: "underline" } as const;
  return (
    <EmailLayout
      plain
      preview={paragraphs[0]?.join(" ") ?? ""}
      footer={
        group ? (
          <>
            {why(group)}{" "}
            <Link href={group.unsubscribeUrl} style={footerLink}>
              Unsubscribe
            </Link>{" "}
            from announcements like this one.
            <br />
            {postal(group)}. {SITE.disclaimer}
          </>
        ) : (
          DIRECT_FOOTER
        )
      }
    >
      {paragraphs.map((lines, i) => (
        <Text key={i} style={paragraph}>
          {/* Real <br>s, not white-space: pre-line, which Outlook ignores. */}
          {lines.map((line, j) => (
            <Fragment key={j}>
              {j > 0 && <br />}
              {linkify(line).map((part, k) =>
                part.kind === "link" ? (
                  // A long address (a survey link is 120 characters) has nowhere to wrap, and would push the email wider than the screen.
                  <Link key={k} href={part.href} style={part.text.length > 40 ? { ...link, wordBreak: "break-all" } : link}>
                    {part.text}
                  </Link>
                ) : (
                  <Fragment key={k}>{part.text}</Fragment>
                ),
              )}
            </Fragment>
          ))}
        </Text>
      ))}
      <Text style={{ ...muted, marginTop: 18, marginBottom: 0 }}>{SIGN_OFF[0]}</Text>
      <Text style={{ ...muted, marginBottom: 0 }}>{SIGN_OFF[1]}</Text>
      <Text style={muted}>{SITE.supportEmail}</Text>
    </EmailLayout>
  );
}

/** The plain-text part, written out rather than converted, so links read exactly as typed. */
export function adminEmailText(body: string, group: GroupFooter | null): string {
  const text = paragraphsOf(body)
    .map((lines) => lines.join("\n"))
    .join("\n\n");
  const footer = group ? `${why(group)}\nUnsubscribe from announcements like this one: ${group.unsubscribeUrl}\n${postal(group)}. ${SITE.disclaimer}` : DIRECT_FOOTER;
  return [text, [...SIGN_OFF, SITE.supportEmail].join("\n"), `--\n${footer}\n${SITE.name} · © ${easternYear()} ${SITE.operator}`].join("\n\n") + "\n";
}

AdminEmail.PreviewProps = {
  body: "Hi Sam,\n\nFall listings come down on Friday. If your place is free again for spring, post it once the fall one is gone.\n\nAny questions, just reply.",
  group: { unsubscribeUrl: `${SITE.url}/unsubscribe?t=00000000-0000-0000-0000-000000000000.1800000000.${"0".repeat(32)}`, mailingAddress: "", posted: true },
};
