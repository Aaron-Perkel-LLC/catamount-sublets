/** Decisions the migration applies (PLAN.md §2.3, §2.4, §8). */

import { ADMIN_INBOX, ALLOWED_EMAILS } from "../../src/config/site";

/**
 * Legacy NetIDs whose account lives at a different address: the admin's (LEGACY_ADMIN_NETID)
 * maps to the admin address, by decision 3. Both come from the environment (.env.example).
 */
const adminNetid = process.env.LEGACY_ADMIN_NETID?.trim().toLowerCase();
export const LEGACY_EMAIL_OVERRIDES: Record<string, string> = adminNetid && ADMIN_INBOX ? { [adminNetid]: ADMIN_INBOX } : {};

/** Accounts that are admins after the import. */
export const ADMIN_EMAILS = [...ALLOWED_EMAILS];

export const LEGACY_EMAIL_DOMAIN = "uvm.edu";

/** The legacy stored photo paths as ./public/images/<stem>.<ext>. */
export const LEGACY_IMAGE_PATH = /^\.\/public\/images\/([a-f0-9]{32})\.([a-z0-9]+)$/i;

export function legacyEmailFor(netid: string): string {
  return LEGACY_EMAIL_OVERRIDES[netid] ?? `${netid}@${LEGACY_EMAIL_DOMAIN}`;
}
