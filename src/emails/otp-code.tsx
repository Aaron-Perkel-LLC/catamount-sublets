import { Text } from "@react-email/components";
import { OTP, SITE } from "@/config/site";
import { EMAIL_COLOURS, EmailLayout, muted, paragraph } from "./layout";

/**
 * The sign-in code. A plain code and no links: Outlook's Safe Links can
 * pre-fetch a one-time link before the student clicks it; a code cannot be
 * spent by a scanner.
 */
export default function OtpCodeEmail({ code }: { code: string }) {
  const minutes = Math.round(OTP.expiresInSeconds / 60);
  return (
    <EmailLayout preview={`${code} is your ${SITE.name} sign-in code`}>
      <Text style={paragraph}>Your sign-in code:</Text>
      <Text
        style={{
          margin: "0 0 18px",
          fontSize: 36,
          lineHeight: "44px",
          fontWeight: 700,
          letterSpacing: "0.25em",
          color: EMAIL_COLOURS.lake,
        }}
      >
        {code}
      </Text>
      <Text style={paragraph}>
        Type it on the sign-in page. It expires in {minutes} minutes and works once.
      </Text>
      <Text style={muted}>If you didn&apos;t ask for a code, ignore this message; nobody can sign in without it.</Text>
    </EmailLayout>
  );
}

OtpCodeEmail.PreviewProps = { code: "482913" };
