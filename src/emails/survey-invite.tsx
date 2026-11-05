import { Button, Link, Text } from "@react-email/components";
import { ALSO_BY, SITE } from "@/config/site";
import { SURVEY_TOKEN_DAYS } from "@/server/survey-token";
import { EMAIL_COLOURS, EmailLayout, muted, paragraph } from "./layout";

/**
 * The feedback survey invitation (November 2026): a note from Aaron with one
 * button, in the welcome message's plain style. `link` is the person's own
 * signed survey link; nothing to sign in to. Sent by
 * scripts/admin/send-survey.ts, never from the app.
 */
export const SURVEY_SUBJECT = `How did ${SITE.name} work for you?`;
export const SURVEY_CTA = "Take the survey";

/** `name` is the person's first name when we have one; empty means "Hi," on its own. Never the login. */
export default function SurveyInviteEmail({ name, link, posted }: { name: string; link: string; posted: boolean }) {
  const inline = { color: EMAIL_COLOURS.lake, fontWeight: 700 } as const;
  return (
    <EmailLayout
      plain
      preview={`Two minutes on how ${SITE.name} worked for you. Nothing to sign in to.`}
      footer={
        <>
          You are getting this once, because you {posted ? "have a listing" : "have an account"} on {SITE.domain}. To stop hearing from me,
          reply with &quot;unsubscribe&quot;. {SITE.disclaimer}
        </>
      }
    >
      <Text style={paragraph}>Hi{name ? ` ${name}` : ""},</Text>
      <Text style={paragraph}>
        You have an account on {SITE.name}, so I&apos;d like to ask a favor: would you take two minutes to tell me how the site has worked
        for you? About ten questions, nothing to sign in to, and I read every answer myself.
      </Text>
      <Button
        href={link}
        style={{
          display: "inline-block",
          backgroundColor: EMAIL_COLOURS.lake,
          color: EMAIL_COLOURS.paper,
          fontWeight: 700,
          fontSize: 16,
          padding: "12px 20px",
          borderRadius: 8,
          textDecoration: "none",
          margin: "4px 0 10px",
        }}
      >
        {SURVEY_CTA}
      </Button>
      <Text style={{ ...muted, marginBottom: 18 }}>The link is yours alone and works for {SURVEY_TOKEN_DAYS} days.</Text>
      <Text style={paragraph}>
        Whether you found a place, filled yours, gave up halfway, or never got around to looking, I want to hear it. I built this for
        students, and it only gets better if I know what worked and what didn&apos;t.
      </Text>
      <Text style={{ ...muted, marginTop: 18, marginBottom: 0 }}>Thanks,</Text>
      <Text style={{ ...muted, marginBottom: 0 }}>{SITE.author.split(" ")[0]}</Text>
      <Text style={muted}>{SITE.supportEmail}</Text>
      <Text style={{ ...muted, marginTop: 18, marginBottom: 0 }}>
        P.S. I also just launched{" "}
        <Link href={ALSO_BY.url} style={inline}>
          {ALSO_BY.name}
        </Link>{" "}
        ({new URL(ALSO_BY.url).host}), {ALSO_BY.tagline}; the survey has one question about it.
      </Text>
    </EmailLayout>
  );
}

SurveyInviteEmail.PreviewProps = { name: "Sam", link: `${SITE.url}/survey?t=00000000-0000-4000-8000-000000000000.1800000000.${"0".repeat(32)}`, posted: true };
