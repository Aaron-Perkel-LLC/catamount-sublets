import { Link, Text } from "@react-email/components";
import { Fragment } from "react";
import { SITE } from "@/config/site";
import { linkify, paragraphsOf } from "@/lib/admin-mail";
import { easternYear } from "@/lib/dates";
import { EMAIL_COLOURS, EmailLayout, muted, paragraph } from "./layout";

/**
 * A one-off note from the admin console: a reply to an access request, or a
 * message to any one address. Styled as the welcome mail is (a personal note,
 * no header bar). The body is the admin's plain text: blank lines make
 * paragraphs, single newlines make line breaks, and web and email addresses
 * become links. It is only ever text nodes and <a>s, never HTML.
 */

const SIGN_OFF = ["Thanks,", SITE.author.split(" ")[0]] as const;
const FOOTER = `Sent from ${SITE.domain}. Reply to this email to reach me directly. ${SITE.disclaimer}`;

export default function AdminMessageEmail({ body }: { body: string }) {
  const paragraphs = paragraphsOf(body);
  const link = { color: EMAIL_COLOURS.lake, fontWeight: 700 } as const;
  return (
    <EmailLayout plain preview={paragraphs[0]?.join(" ") ?? ""} footer={FOOTER}>
      {paragraphs.map((lines, i) => (
        <Text key={i} style={paragraph}>
          {/* Real <br>s, not white-space: pre-line, which Outlook ignores. */}
          {lines.map((line, j) => (
            <Fragment key={j}>
              {j > 0 && <br />}
              {linkify(line).map((part, k) =>
                part.kind === "link" ? (
                  <Link key={k} href={part.href} style={link}>
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
export function adminMessageText(body: string): string {
  const text = paragraphsOf(body)
    .map((lines) => lines.join("\n"))
    .join("\n\n");
  return [text, [...SIGN_OFF, SITE.supportEmail].join("\n"), `--\n${FOOTER}\n${SITE.name} · © ${easternYear()} ${SITE.operator}`].join("\n\n") + "\n";
}

AdminMessageEmail.PreviewProps = {
  body: "Hi Sam,\n\nThanks for writing. I've approved your address, so you can sign in now at https://catamountsublets.com/sign-in.\n\nAny questions, just reply.",
};
