import { Link, Text } from "@react-email/components";
import { LEGACY, SITE } from "@/config/site";
import { deadlineWords } from "@/lib/dates";
import { EMAIL_COLOURS, EmailLayout, muted, paragraph } from "./layout";

/**
 * To a migrated poster who has never signed in here: their listing comes down
 * at the deadline unless they sign in once. A note from Aaron like the
 * welcome: no images, no buttons, one link (the front page), nothing that
 * acts on a click. Sent by scripts/admin/send-stale-notice.ts, never from
 * the app. `deadline` is an Eastern calendar date ("YYYY-MM-DD"); the
 * listings go after 11:59 pm Eastern that day (remove-stale.ts).
 */

export const staleNoticeSubject = (deadline: string, reminder = false) => `${reminder ? "Reminder: " : ""}Your sublet listing comes down ${deadlineWords(deadline).short}`;

const authorFirstName = SITE.author.split(" ")[0];

/** `name` is the first name when we have one; empty means "Hi," alone. `email` is their own sign-in address. */
export default function StaleNoticeEmail({ name, street, email, deadline }: { name: string; street: string; email: string; deadline: string }) {
  const when = `11:59 pm on ${deadlineWords(deadline).long}`;
  const link = { color: EMAIL_COLOURS.lake, fontWeight: 700 } as const;
  return (
    <EmailLayout plain preview={`Sign in once by ${when} to keep your listing for ${street} up.`} footer={<>{SITE.disclaimer}</>}>
      <Text style={paragraph}>Hi{name ? ` ${name}` : ""},</Text>
      <Text style={paragraph}>
        When {LEGACY.name} moved to {SITE.domain} in October, your listing for {street} came over with it. You haven&apos;t
        signed in on the new site yet, so I&apos;m guessing you&apos;ve found someone or don&apos;t need it anymore.
      </Text>
      <Text style={paragraph}>
        To keep the listings current, I&apos;m removing listings and accounts that haven&apos;t been signed into by {when}.
      </Text>
      <Text style={paragraph}>
        If you want yours to stay up, sign in once at{" "}
        <Link href={SITE.url} style={link}>
          {SITE.domain}
        </Link>{" "}
        with {email}, and that&apos;s it. If it&apos;s already filled, you don&apos;t need to do anything.
      </Text>
      <Text style={paragraph}>Questions? Just reply to this email.</Text>
      <Text style={{ ...muted, marginTop: 18 }}>— {authorFirstName}</Text>
    </EmailLayout>
  );
}

StaleNoticeEmail.PreviewProps = { name: "Sam", street: "12 Main St", email: "sam@example.com", deadline: "2026-11-20" };
