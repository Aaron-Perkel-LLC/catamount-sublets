import { createHmac, timingSafeEqual } from "node:crypto";
import { SITE } from "@/config/site";
import { appUrl, isProductionEnv } from "@/env";
import { formatMiles } from "./distance-format";
import { formatMoney } from "./format";
import { sizeSummary } from "./options";

/**
 * Public share links: /s/<id>-<token>. The token is derived, not stored:
 * the first ten hex characters of an HMAC over the listing id, so /s/1,
 * /s/2, /s/3 is not a public index of every listing. Links the old site
 * issued carry its token, which the migration stored on the listing
 * (listings.legacy_share_token); parseShareSlug accepts either, and new
 * links are always issued under this site's secret.
 */

export const SHARE_TOKEN_LENGTH = 10;
const SLUG = /^([0-9]{1,10})-([a-f0-9]{10})$/;

/** The site's signing secret: share tokens and actor keys derive from it, domain-separated. Survey links have their own (src/server/survey-token.ts). */
export function appSecret(): string {
  const s = process.env.APP_SECRET;
  if (s) return s;
  if (isProductionEnv()) throw new Error("APP_SECRET is not set");
  return "development-only-secret";
}

export function shareToken(id: number): string {
  return createHmac("sha256", appSecret()).update(`sublet:${id}`).digest("hex").slice(0, SHARE_TOKEN_LENGTH);
}

export function shareSlug(id: number): string {
  return `${id}-${shareToken(id)}`;
}

export function shareUrl(id: number): string {
  return `${appUrl()}/s/${shareSlug(id)}`;
}

/** The analytics actor key: a keyed hash of the user id, domain-separated from share tokens. */
export function actorKey(userId: string): string {
  return createHmac("sha256", appSecret()).update(`actor:${userId}`).digest("hex").slice(0, 16);
}

export interface ParsedSlug {
  id: number;
  token: string;
}

/** Shape only; the token is checked against the listing by verifyShareToken(). */
export function parseShareSlug(slug: string): ParsedSlug | null {
  const m = SLUG.exec(slug);
  if (!m) return null;
  const id = Number(m[1]);
  if (!Number.isInteger(id) || id <= 0) return null;
  return { id, token: m[2].toLowerCase() };
}

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** True for this site's token, or the one the old site issued for the same listing. */
export function verifyShareToken(id: number, token: string, legacyToken: string | null): boolean {
  if (same(token, shareToken(id))) return true;
  return legacyToken !== null && legacyToken.length === SHARE_TOKEN_LENGTH && same(token, legacyToken.toLowerCase());
}

/**
 * Everything the public ever sees of a listing: on the share page's meta
 * tags and painted into the card. Price, semester, size and distance from
 * campus — and nothing else. Adding a field here publishes it.
 */
export interface ShareCardLines {
  price: string;
  negotiable: boolean;
  semester: string;
  /** "2 bd · 1.5 ba · 1 roommate · 0.4 mi from campus" */
  facts: string;
  title: string;
  description: string;
}

export function shareCardLines(l: {
  price: number;
  priceNegotiable: boolean;
  semesterLabel: string;
  bedrooms: number | null;
  bathrooms: number | null;
  roommates: number | null;
  distanceMi: number;
}): ShareCardLines {
  const price = `${formatMoney(l.price)}/mo`;
  const facts = [sizeSummary(l), formatMiles(l.distanceMi)].filter(Boolean).join(" · ");
  return {
    price,
    negotiable: l.priceNegotiable,
    semester: l.semesterLabel,
    facts,
    title: [price, l.semesterLabel, SITE.name].filter(Boolean).join(" · "),
    description: `${facts}. Sign in with your student email to see the listing.`,
  };
}
