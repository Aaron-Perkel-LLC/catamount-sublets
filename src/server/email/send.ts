import type { ReactElement } from "react";
import { render } from "@react-email/components";
import { Resend } from "resend";
import { SITE } from "@/config/site";
import { isProductionEnv } from "@/env";
import { log } from "@/server/log";

/**
 * Every outbound email goes through sendMail(). It returns false on failure
 * (logged, never thrown).
 *
 * Outside production, no RESEND_API_KEY means "console mode": the message is
 * printed with a [mail:console] prefix instead of sent. src/instrumentation.ts
 * refuses to boot production without a key, so a code can never land in
 * production logs.
 *
 * One-time codes are sent directly and synchronously from the auth hook;
 * broadcasts go through src/server/email/broadcast.ts, which paces itself, so
 * a code is never queued behind a bulk send.
 */

export type MailKind = "login_code" | "admin_notice" | "access_request" | "welcome" | "broadcast" | "broadcast_copy" | "survey_invite";

/**
 * Print instead of send only on a developer's machine. On Vercel (preview or
 * production) a missing key is a failed send that the person sees, never a
 * code written to a log: that is how the 8 October preview "lost" its codes.
 */
export function consoleMode(): boolean {
  if (process.env.VERCEL || isProductionEnv()) return false;
  // Off Vercel, a key alone is not enough: `next dev` with a key in .env.local
  // must still print. The admin scripts set MAIL_LIVE=1 when they mean it.
  return !(process.env.RESEND_API_KEY && process.env.MAIL_LIVE === "1");
}

/**
 * Addresses that exist only in seeds, fixtures and examples. They never reach
 * Resend from any environment: three of them bounced on 8 October when a
 * local run had a real key.
 */
export function isTestAddress(email: string): boolean {
  const e = email.trim().toLowerCase();
  return /^(seed\d*|test\d*|poster|other|viewer|optout|gone|jsmith)@/.test(e) || /@(example\.(com|org|net)|localhost)$/.test(e) || /\.(test|invalid|example|localhost)$/.test(e);
}

/** For the boot log and the admin: how mail will go out from this process. */
export function mailMode(): "resend" | "console" | "unconfigured" {
  if (consoleMode()) return "console";
  return process.env.RESEND_API_KEY ? "resend" : "unconfigured";
}

/** Under vitest, mail is collected here instead of printed, so tests can assert on it. */
export const sentInTests: { to: string; subject: string; kind: MailKind; text: string }[] = [];

/** Codes come from the transactional sender, the admin's notices from their own, and the notes signed by the author from the author. */
export function senderFor(kind: MailKind): string {
  if (kind === "broadcast" || kind === "broadcast_copy" || kind === "welcome" || kind === "survey_invite") return SITE.mailFromPersonal;
  if (kind === "admin_notice" || kind === "access_request") return SITE.mailFromNotices;
  return SITE.mailFrom;
}

let client: Resend | undefined;
function resend(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set");
  return (client ??= new Resend(key));
}

export interface SendMailArgs {
  to: string;
  subject: string;
  react: ReactElement;
  kind: MailKind;
  /** Defaults to the support address on every message; null sends none. */
  replyTo?: string | null;
  /** Correlation id for the log line (a listing id, a broadcast id); never an email. */
  ref?: string | number;
}

export interface SendMailResult {
  ok: boolean;
  id?: string;
}

export async function sendMail(args: SendMailArgs): Promise<SendMailResult> {
  if (isTestAddress(args.to) && !consoleMode() && !process.env.VITEST) {
    log.warn("mail.refused_test_address", { kind: args.kind, ref: args.ref });
    return { ok: false };
  }
  const html = await render(args.react);
  const text = await render(args.react, { plainText: true });
  const from = senderFor(args.kind);
  const replyTo = args.replyTo === null ? undefined : (args.replyTo ?? SITE.mailReplyTo);

  if (consoleMode()) {
    if (process.env.VITEST) {
      sentInTests.push({ to: args.to, subject: args.subject, kind: args.kind, text });
      return { ok: true, id: "test" };
    }
    // Development only (see consoleMode): the whole message, code included.
    // eslint-disable-next-line no-console
    console.log(`[mail:console] kind=${args.kind} from=${from} to=${args.to}\nSubject: ${args.subject}\n\n${text}\n`);
    return { ok: true, id: "console" };
  }

  if (!process.env.RESEND_API_KEY) {
    log.error("mail.not_configured", new Error("RESEND_API_KEY is not set"), { kind: args.kind, ref: args.ref });
    return { ok: false };
  }

  try {
    const send = () =>
      resend().emails.send({
        from,
        to: args.to,
        subject: args.subject,
        html,
        text,
        replyTo,
        headers: {
          "X-Entity-Ref-ID": `${args.kind}:${args.ref ?? ""}`,
          // Relationship mail still says how to stop it; a code does not need the header.
          ...(args.kind === "welcome" || args.kind === "broadcast" || args.kind === "survey_invite" ? { "List-Unsubscribe": `<mailto:${SITE.supportEmail}?subject=unsubscribe>` } : {}),
        },
      });
    // Resend's per-second API limit is shared by the whole account; a refused
    // request was not sent, so waiting and asking again cannot double-send.
    let { data, error } = await send();
    for (let attempt = 1; error?.name === "rate_limit_exceeded" && attempt <= 3; attempt++) {
      await new Promise((res) => setTimeout(res, 1000 * attempt));
      ({ data, error } = await send());
    }
    if (error) {
      log.error("mail.send_failed", new Error(error.message), { kind: args.kind, ref: args.ref });
      return { ok: false };
    }
    log.info("mail.sent", { kind: args.kind, ref: args.ref, id: data?.id });
    return { ok: true, id: data?.id };
  } catch (error) {
    log.error("mail.send_threw", error, { kind: args.kind, ref: args.ref });
    return { ok: false };
  }
}
