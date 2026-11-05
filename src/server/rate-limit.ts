import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { rateLimitBuckets } from "@/db/schema";

/**
 * Application rate limits, backed by Postgres so they hold across serverless
 * instances (there is no WAF layer on the Hobby plan). Fixed windows: one
 * atomic upsert per check, which also resets a window that has lapsed.
 *
 * Subjects are hashed before they become a key, so the table never holds an
 * address or an IP. A check that cannot reach the database fails open and is
 * logged by the caller; the limits here are a second line behind the
 * per-address throttle in the auth hook and better-auth's own per-IP limiter.
 */

export type RateLimitRule = { scope: string; limit: number; windowSeconds: number };

export type RateLimitResult = { allowed: boolean; count: number; remaining: number; retryAfterSeconds: number };

/** The rules in one place. Names are the scopes stored in the key. */
export const RATE_LIMITS = {
  /** Sign-in codes requested for one address. */
  otpSendPerEmail: { scope: "otp_send_email", limit: 5, windowSeconds: 3600 },
  /** Sign-in codes requested from one IP. Campus networks put many people behind one address, so this is loose. */
  otpSendPerIp: { scope: "otp_send_ip", limit: 30, windowSeconds: 600 },
  /** Code verification attempts for one address, across codes (each code also dies after OTP.allowedAttempts). */
  otpVerifyPerEmail: { scope: "otp_verify_email", limit: 15, windowSeconds: 600 },
  /** Code verification attempts from one IP. */
  otpVerifyPerIp: { scope: "otp_verify_ip", limit: 60, windowSeconds: 600 },
  /** Listings created by one person (a listing is one per account, so this only bites create-delete loops). */
  listingCreatePerUser: { scope: "listing_create_user", limit: 3, windowSeconds: 86_400 },
  /** Front-page access and school requests from one IP (no account behind them). */
  accessRequestPerIp: { scope: "access_request_ip", limit: 5, windowSeconds: 3600 },
  /** Access and school requests giving one reply address. */
  accessRequestPerEmail: { scope: "access_request_email", limit: 3, windowSeconds: 86_400 },
  /** Survey answers from one address in an hour: a person re-saving a few times, not a script. */
  surveyPerIp: { scope: "survey_ip", limit: 10, windowSeconds: 3600 },
} as const satisfies Record<string, RateLimitRule>;

export function rateLimitKey(scope: string, subject: string): string {
  return `${scope}:${createHash("sha256").update(subject).digest("hex").slice(0, 32)}`;
}

/**
 * Count one hit for `subject` under `rule` and say whether it is within the
 * limit. The hit is counted even when refused, so hammering extends nothing
 * but never shortens the wait either.
 */
export async function takeRateLimit(db: DbOrTx, rule: RateLimitRule, subject: string, now: Date = new Date()): Promise<RateLimitResult> {
  const key = rateLimitKey(rule.scope, subject);
  const windowMs = rule.windowSeconds * 1000;
  const cutoff = new Date(now.getTime() - windowMs);
  const [row] = await db
    .insert(rateLimitBuckets)
    .values({ key, count: 1, windowStart: now })
    .onConflictDoUpdate({
      target: rateLimitBuckets.key,
      set: {
        count: sql`case when ${rateLimitBuckets.windowStart} < ${cutoff} then 1 else ${rateLimitBuckets.count} + 1 end`,
        windowStart: sql`case when ${rateLimitBuckets.windowStart} < ${cutoff} then ${now} else ${rateLimitBuckets.windowStart} end`,
      },
    })
    .returning({ count: rateLimitBuckets.count, windowStart: rateLimitBuckets.windowStart });
  const count = row.count;
  const resetAt = row.windowStart.getTime() + windowMs;
  return {
    allowed: count <= rule.limit,
    count,
    remaining: Math.max(0, rule.limit - count),
    retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now.getTime()) / 1000)),
  };
}

/** Rows whose window ended before `before`; the cron sweep deletes them. */
export function expiredBucketsBefore(before: Date, maxWindowSeconds = 86_400): Date {
  return new Date(before.getTime() - maxWindowSeconds * 1000);
}
