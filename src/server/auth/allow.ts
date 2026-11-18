import "server-only";
import type { DbOrTx } from "@/db";
import { type AccountTier, checkEmailAllowed, EmailNotAllowedError } from "@/lib/auth-allow";
import { isEmailApproved } from "@/server/data/access-requests";
import { DISPOSABLE_DOMAINS } from "./disposable-domains";

/**
 * Who may sign in, and with which tier: hard rule 5's one gate. Called from
 * the better-auth before-hook on the code endpoints (so nothing is mailed to a
 * refused address) and from the user-create database hook (so no row is
 * created by any path, and the row gets its tier). Both, always.
 *
 *   1. the shared rule (src/lib/auth-allow.ts): a valid address, a school's
 *      local-part rule (SCHOOLS), school domain → student, else community;
 *   2. an address the admin approved from an access request is a student;
 *   3. any other community address on a disposable domain is refused (the
 *      domain or any parent of it, so x.mailinator.com is caught too).
 */

/** True when the domain, or any domain it sits under, is on the vendored throwaway list. */
export function isDisposableDomain(domain: string): boolean {
  const parts = domain.toLowerCase().split(".");
  for (let i = 0; i < parts.length - 1; i++) {
    if (DISPOSABLE_DOMAINS.has(parts.slice(i).join("."))) return true;
  }
  return false;
}

export async function assertEmailAllowed(db: DbOrTx, raw: string): Promise<{ email: string; tier: AccountTier }> {
  const result = checkEmailAllowed(raw);
  if (!result.ok) throw new EmailNotAllowedError(result);
  if (result.tier === "student") return { email: result.email, tier: "student" };
  if (await isEmailApproved(db, result.email)) return { email: result.email, tier: "student" };
  if (isDisposableDomain(result.email.slice(result.email.lastIndexOf("@") + 1))) {
    throw new EmailNotAllowedError({ ok: false, email: result.email, reason: "disposable" });
  }
  return { email: result.email, tier: "community" };
}
