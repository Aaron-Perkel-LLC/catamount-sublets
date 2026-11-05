import { Link, Text } from "@react-email/components";
import { ALLOWED_EMAIL_DOMAINS, LEGACY, SITE } from "@/config/site";
import { EMAIL_COLOURS, EmailLayout, muted, paragraph } from "./layout";

/**
 * The one message every migrated poster gets on cutover day: where the site
 * went, how to sign in now, and how to get rid of their data. Written as a
 * note from Aaron, not a blast: no header bar, one link, plain words, a
 * plain-text part (send.ts renders one for every message). Sent by
 * scripts/admin/send-welcome.ts, never from the app.
 */
/** `name` is the person's first name when we have one; empty means "Hi," on its own. Never the NetID. */
export default function WelcomeEmail({ name, listingId }: { name: string; listingId: number | null }) {
  const domain = ALLOWED_EMAIL_DOMAINS[0];
  const link = { color: EMAIL_COLOURS.lake, fontWeight: 700 } as const;
  return (
    <EmailLayout
      plain
      preview={`${LEGACY.name} is now ${SITE.name}, at ${SITE.domain}.`}
      footer={
        <>
          You are getting this once, because you had a listing on {LEGACY.name}. To stop hearing from me, reply with
          &quot;unsubscribe&quot; and I will delete your listing and account. {SITE.disclaimer}
        </>
      }
    >
      <Text style={paragraph}>Hi{name ? ` ${name}` : ""},</Text>
      <Text style={paragraph}>
        {LEGACY.name} has moved. It is now called {SITE.name} and lives at{" "}
        <Link href={SITE.url} style={link}>
          {SITE.domain}
        </Link>
        {listingId ? ". Your listing came with it, photos and all." : "."}
      </Text>
      <Text style={paragraph}>
        Signing in has changed. There is no university login any more: enter your {domain} address in its short form (the
        NetID one, netid@{domain}) and a six-digit code is emailed to you. No password to make up. The first time in,
        it asks for your first and last name, which takes ten seconds. If a code does not arrive within a minute, check
        Junk and mark the message as not junk so the next one lands in your inbox.
      </Text>
      <Text style={paragraph}>
        Nothing about your listing changed: same price, same semesters, same contact details, and you can edit it, pause it,
        mark it taken or delete it as before. Share links you already sent keep working, and the old address redirects.
      </Text>
      <Text style={paragraph}>
        If you would rather not be on the new site, sign in once and use Delete my account on the account page, or reply
        to this email and I will do it for you. Either way the listing, the photos and the account go together.
      </Text>
      <Text style={paragraph}>Reply to this email with any question. I read every one.</Text>
      <Text style={{ ...muted, marginTop: 18, marginBottom: 0 }}>Thanks,</Text>
      <Text style={{ ...muted, marginBottom: 0 }}>Aaron</Text>
      <Text style={muted}>{SITE.supportEmail}</Text>
    </EmailLayout>
  );
}

WelcomeEmail.PreviewProps = { name: "Sam", listingId: 187 };
