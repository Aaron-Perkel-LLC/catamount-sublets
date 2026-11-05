import { ALLOWED_EMAILS, ALLOWED_EMAIL_DOMAINS } from "@/config/site";

/**
 * Who may sign in. Called from the better-auth before-hook on the send-code
 * and sign-in-with-code endpoints (so nothing is ever mailed to a disallowed
 * address) and from the user-create database hook (so no row is created by
 * any path). Both, always.
 *
 * The rule is public ("@uvm.edu addresses"), so stating it leaks nothing;
 * account existence is not leaked because new and existing addresses get the
 * identical flow.
 */

export type EmailAllowResult =
  | { ok: true; email: string }
  | { ok: false; email: string; reason: "invalid" | "dotted_local_part" | "domain" };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Lowercased and trimmed; the only form that is ever stored or compared. */
export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

export function checkEmailAllowed(input: string): EmailAllowResult {
  const email = normalizeEmail(input);
  if (!EMAIL.test(email) || email.length > 254) return { ok: false, email, reason: "invalid" };
  if (ALLOWED_EMAILS.includes(email)) return { ok: true, email };

  const at = email.lastIndexOf("@");
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (!(ALLOWED_EMAIL_DOMAINS as readonly string[]).includes(domain)) {
    return { ok: false, email, reason: "domain" };
  }
  // UVM mailboxes answer to both netid@ and First.Last@. Accounts are keyed on
  // the NetID form; accepting the other would silently create a second,
  // empty account for the same person.
  if (local.includes(".")) return { ok: false, email, reason: "dotted_local_part" };
  return { ok: true, email };
}

/** The sentence shown to the person when their address is refused. */
export function emailRefusalMessage(reason: Exclude<EmailAllowResult, { ok: true }>["reason"]): string {
  const domains = ALLOWED_EMAIL_DOMAINS.map((d) => `@${d}`).join(" or ");
  switch (reason) {
    case "invalid":
      return "That doesn't look like an email address.";
    case "domain":
      return `Sign-in is limited to ${domains} addresses for now.`;
    case "dotted_local_part":
      return `Use your NetID email (netid@${ALLOWED_EMAIL_DOMAINS[0]}), not your first.last alias.`;
  }
}

export class EmailNotAllowedError extends Error {
  constructor(public readonly result: Exclude<EmailAllowResult, { ok: true }>) {
    super(emailRefusalMessage(result.reason));
    this.name = "EmailNotAllowedError";
  }
}

/** The normalized address, or throws EmailNotAllowedError. */
export function assertEmailAllowed(input: string): string {
  const result = checkEmailAllowed(input);
  if (!result.ok) throw new EmailNotAllowedError(result);
  return result.email;
}
