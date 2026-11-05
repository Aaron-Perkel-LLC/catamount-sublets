import { Text } from "@react-email/components";
import { Fragment } from "react";
import { SITE } from "@/config/site";
import { EmailLayout, muted, paragraph } from "./layout";

export const BROADCAST_SIGNATURE = ["Thanks,", SITE.author.split(" ")[0], SITE.name] as const;

/**
 * The admin's message to posters or account holders. Paragraphs are
 * blank-line separated; the sign-off is added here so it is never typed. The
 * footer says why the person is getting it (a listing, or just an account)
 * and where to write back.
 */
export default function BroadcastEmail({ paragraphs, greeting, posted }: { paragraphs: string[]; greeting: string | null; posted: boolean }) {
  return (
    <EmailLayout
      preview={paragraphs[0] ?? ""}
      footer={
        <>
          You&apos;re getting this because you {posted ? "posted a listing" : "have an account"} on {SITE.domain}. Questions or issues? Reply to this email.{" "}
          {SITE.disclaimer}
        </>
      }
    >
      {greeting && <Text style={paragraph}>{greeting}</Text>}
      {paragraphs.map((p, i) => (
        <Text key={i} style={paragraph}>
          {p}
        </Text>
      ))}
      {/* Real <br>s, not white-space: pre-line, which Outlook ignores and runs the lines together. */}
      <Text style={{ ...muted, marginTop: 18 }}>
        {BROADCAST_SIGNATURE.map((line, i) => (
          <Fragment key={i}>
            {i > 0 && <br />}
            {line}
          </Fragment>
        ))}
      </Text>
    </EmailLayout>
  );
}

BroadcastEmail.PreviewProps = {
  greeting: "Hi Sam,",
  posted: true,
  paragraphs: ["Spring listings go live on Monday. If your place is still available, give your post a quick look.", "Thanks for using the site."],
};
