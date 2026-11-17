import "server-only";

/**
 * The weekly digest's two deployment settings, read here and nowhere else.
 * `server-only` makes a client import a build error, so neither can reach the
 * browser bundle. Both live in Vercel env vars, not the repo: the repo is
 * public. While either is missing, digestBlockers() holds the digest.
 */

/** The postal address in the digest's footer (CAN-SPAM wants one in bulk mail). */
export function digestMailingAddress(): string {
  return (process.env.MAILING_ADDRESS ?? "").trim();
}

/**
 * The Resend sending key scoped to SITE.mailDigestDomain. The digest sends with
 * this one only, never the root-scoped RESEND_API_KEY, which Resend would
 * refuse from the subdomain.
 */
export function digestResendKey(): string | undefined {
  return process.env.RESEND_DIGEST_API_KEY || undefined;
}
