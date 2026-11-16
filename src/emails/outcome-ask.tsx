import { Button, Text } from "@react-email/components";
import { SITE } from "@/config/site";
import { EMAIL_ANSWER_VALUES, EMAIL_ANSWERS, type EmailAnswer } from "@/lib/listing-outcome";
import { OUTCOME_TOKEN_DAYS } from "@/server/outcome-token";
import { EMAIL_COLOURS, EmailLayout, muted, paragraph } from "./layout";

/**
 * "Is your sublet still available?": sent to a semester's posters before it
 * is archived, from the admin's Semesters section (never automatically).
 * Four links, each the poster's own signed answer; nothing to sign in to.
 * Filled marks the listing taken and Still available stamps it confirmed
 * (src/server/services/listing-outcome.ts); Taking it down only records.
 */
export const OUTCOME_ASK_SUBJECT = "Is your sublet still available?";

export interface OutcomeAskProps {
  /** First name, or empty for "Hi,". Never the login. */
  name: string;
  /** The listing's street, so they know which post this is about. */
  place: string;
  semesterName: string;
  links: Record<EmailAnswer, string>;
}

export default function OutcomeAskEmail({ name, place, semesterName, links }: OutcomeAskProps) {
  const button = (primary: boolean) =>
    ({
      display: "inline-block",
      backgroundColor: primary ? EMAIL_COLOURS.lake : EMAIL_COLOURS.paper,
      color: primary ? EMAIL_COLOURS.paper : EMAIL_COLOURS.lake,
      border: `2px solid ${EMAIL_COLOURS.lake}`,
      fontWeight: 700,
      fontSize: 15,
      padding: "10px 16px",
      borderRadius: 8,
      textDecoration: "none",
      margin: "0 0 8px",
    }) as const;
  return (
    <EmailLayout
      plain
      preview={`One tap: did ${place} find a subletter? Nothing to sign in to.`}
      footer={
        <>
          You are getting this because you have a listing for {semesterName} on {SITE.domain}. To stop hearing from me, reply with
          &quot;unsubscribe&quot;. {SITE.disclaimer}
        </>
      }
    >
      <Text style={paragraph}>Hi{name ? ` ${name}` : ""},</Text>
      <Text style={paragraph}>
        {semesterName} is wrapping up, and your listing at {place} will come down with it. Before it does: did you find someone?
      </Text>
      <Text style={paragraph}>
        One tap answers it, with nothing to sign in to. Filled marks your listing as taken (you can undo that from My post); Still available
        shows today&apos;s date on it as confirmed.
      </Text>
      <div style={{ margin: "4px 0 10px" }}>
        {/* One block each, so they stack on a phone and the plain-text part puts each link on its own line. */}
        {EMAIL_ANSWER_VALUES.map((a, i) => (
          <div key={a}>
            <Button href={links[a]} style={button(i === 0)}>
              {EMAIL_ANSWERS[a]}
            </Button>
          </div>
        ))}
      </div>
      <Text style={{ ...muted, marginBottom: 18 }}>
        These links are yours alone and work for {OUTCOME_TOKEN_DAYS} days, even after the listing is gone. Tap a different one to change
        your answer. Taking it down only records your answer; to take the listing down sooner, delete it from My post on the site.
      </Text>
      <Text style={paragraph}>
        It tells me whether {SITE.name} actually helps people fill their places, which is the one number I care about.
      </Text>
      <Text style={{ ...muted, marginTop: 18, marginBottom: 0 }}>Thanks,</Text>
      <Text style={{ ...muted, marginBottom: 0 }}>{SITE.author.split(" ")[0]}</Text>
      <Text style={muted}>{SITE.supportEmail}</Text>
    </EmailLayout>
  );
}

const sample = (a: EmailAnswer) => `${SITE.url}/outcome?t=187.1800000000.${"0".repeat(32)}&a=${a}`;
OutcomeAskEmail.PreviewProps = {
  name: "Sam",
  place: "52 N Willard St",
  semesterName: "Spring 2027",
  links: Object.fromEntries(EMAIL_ANSWER_VALUES.map((a) => [a, sample(a)])) as Record<EmailAnswer, string>,
} satisfies OutcomeAskProps;
