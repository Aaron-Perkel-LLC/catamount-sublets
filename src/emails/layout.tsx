import { Body, Container, Head, Hr, Html, Link, Preview, Section, Text } from "@react-email/components";
import type { ReactNode } from "react";
import { SITE } from "@/config/site";
import { easternYear } from "@/lib/dates";

/**
 * Email chrome: tables and inline styles, because Outlook (the students' mail)
 * ignores most CSS. Colours are the brand tokens as literals, since emails
 * cannot read CSS variables; keep them in step with src/app/globals.css.
 */
export const EMAIL_COLOURS = {
  lake: "#1D4F73",
  maple: "#BC4C25",
  cream: "#F7F3EC",
  paper: "#FFFFFF",
  ink: "#1C2328",
  ink2: "#4A565E",
  ink3: "#5F6B74",
  line: "#E3DED6",
} as const;

const font = "'Bricolage Grotesque', Helvetica, Arial, sans-serif";

/** `plain` drops the coloured header bar and accent border: a personal note, not a branded blast (used by the welcome message). */
export function EmailLayout({ preview, children, footer, plain = false }: { preview: string; children: ReactNode; footer?: ReactNode; plain?: boolean }) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ margin: 0, backgroundColor: EMAIL_COLOURS.cream, fontFamily: font, color: EMAIL_COLOURS.ink }}>
        <Container style={{ maxWidth: 560, margin: "0 auto", padding: "24px 16px" }}>
          {!plain && (
            <Section style={{ backgroundColor: EMAIL_COLOURS.lake, borderRadius: "12px 12px 0 0", padding: "18px 24px" }}>
              <Text style={{ margin: 0, color: EMAIL_COLOURS.paper, fontSize: 18, fontWeight: 700 }}>{SITE.name}</Text>
            </Section>
          )}
          <Section
            style={{
              backgroundColor: EMAIL_COLOURS.paper,
              border: `1px solid ${EMAIL_COLOURS.line}`,
              borderTop: plain ? `1px solid ${EMAIL_COLOURS.line}` : `4px solid ${EMAIL_COLOURS.maple}`,
              borderRadius: plain ? "12px" : "0 0 12px 12px",
              padding: "24px",
            }}
          >
            {children}
          </Section>
          <Hr style={{ borderColor: EMAIL_COLOURS.line, margin: "20px 0 12px" }} />
          <Text style={{ margin: 0, color: EMAIL_COLOURS.ink3, fontSize: 12, lineHeight: "18px" }}>
            {footer ?? (
              <>
                {SITE.name} · {SITE.domain}. {SITE.disclaimer} Questions? Email {SITE.supportEmail}.
              </>
            )}
          </Text>
          <Text style={{ margin: "8px 0 0", color: EMAIL_COLOURS.ink3, fontSize: 12, lineHeight: "18px" }}>
            {SITE.name} · © {easternYear()}{" "}
            <Link href={SITE.operatorUrl} style={{ color: EMAIL_COLOURS.ink3, textDecoration: "underline" }}>
              {SITE.operator}
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export const paragraph = { margin: "0 0 14px", fontSize: 16, lineHeight: "24px", color: EMAIL_COLOURS.ink } as const;
export const muted = { margin: "0 0 10px", fontSize: 14, lineHeight: "20px", color: EMAIL_COLOURS.ink2 } as const;
