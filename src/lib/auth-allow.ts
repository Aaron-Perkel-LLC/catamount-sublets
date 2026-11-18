import { ACCESS, ALLOWED_EMAILS, SCHOOLS, type SchoolKey } from "@/config/site";

/**
 * The address rule every sign-in shares, safe for the browser (the sign-in
 * form runs it before asking for a code). The server's gate is
 * assertEmailAllowed() in src/server/auth/allow.ts, which adds the
 * disposable-domain list and the admin's approvals on top of this; it is
 * called from the better-auth before-hook on the code endpoints and from the
 * user-create database hook. Both, always.
 *
 * The tier an address earns is decided here too: an address at a school in
 * SCHOOLS (or the admin's own) makes a student account; any other valid
 * address makes a community account. The rule is public, so stating it
 * leaks nothing; account existence is not leaked because new and existing
 * addresses get the identical flow.
 */

export type AccountTier = "student" | "community";
export const ACCOUNT_TIERS = ["student", "community"] as const satisfies readonly AccountTier[];

export type EmailRefusalReason = "invalid" | "dotted_local_part" | "disposable";

export type EmailAllowResult =
  | { ok: true; email: string; tier: AccountTier; school: SchoolKey | null }
  | { ok: false; email: string; reason: EmailRefusalReason };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Lowercased and trimmed; the only form that is ever stored or compared. */
export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

/** The school whose domain this exactly is (no subdomains, no look-alikes), or null. */
export function schoolOfDomain(domain: string): (typeof SCHOOLS)[number] | null {
  return SCHOOLS.find((s) => (s.domains as readonly string[]).includes(domain)) ?? null;
}

export function checkEmailAllowed(input: string): EmailAllowResult {
  const email = normalizeEmail(input);
  if (!EMAIL.test(email) || email.length > 254) return { ok: false, email, reason: "invalid" };
  if (ALLOWED_EMAILS.includes(email)) return { ok: true, email, tier: "student", school: null };

  const at = email.lastIndexOf("@");
  const local = email.slice(0, at);
  const school = schoolOfDomain(email.slice(at + 1));
  if (!school) return { ok: true, email, tier: "community", school: null };
  // UVM mailboxes answer to both netid@ and First.Last@. Accounts are keyed on
  // the NetID form; accepting the other would silently create a second,
  // empty account for the same person.
  if (school.localPart === "netid" && local.includes(".")) return { ok: false, email, reason: "dotted_local_part" };
  return { ok: true, email, tier: "student", school: school.key };
}

/** The tier an address earns by the shared rule alone (no approvals): what the post-deploy backfill compares with. */
export function tierForEmail(input: string): AccountTier | null {
  const r = checkEmailAllowed(input);
  return r.ok ? r.tier : null;
}

/** The sentence shown to the person when their address is refused. */
export function emailRefusalMessage(reason: EmailRefusalReason): string {
  switch (reason) {
    case "invalid":
      return "That doesn't look like an email address.";
    case "dotted_local_part":
      return ACCESS.dottedRefusal;
    case "disposable":
      return "That looks like a throwaway address. Use one you'll keep: posters reply to it.";
  }
}

export class EmailNotAllowedError extends Error {
  constructor(public readonly result: Extract<EmailAllowResult, { ok: false }>) {
    super(emailRefusalMessage(result.reason));
    this.name = "EmailNotAllowedError";
  }
}
