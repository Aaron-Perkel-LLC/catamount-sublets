import { lt, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { otpSends, rateLimit, rateLimitBuckets, verification } from "@/db/schema";
import { expiredBucketsBefore } from "@/server/rate-limit";
import { log } from "@/server/log";
import { sweepRawUploads } from "@/server/services/admin";

export const runtime = "nodejs";

/**
 * Daily housekeeping (vercel.json): raw uploads nobody attached within a
 * day, expired one-time codes, lapsed rate-limit windows and code-send rows.
 * Nothing user-visible is touched.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return new NextResponse("Unauthorized", { status: 401 });
  const db = await getDb();
  const dayAgo = new Date(Date.now() - 86_400_000);
  const raw = await sweepRawUploads();
  const codes = await db.delete(verification).where(lt(verification.expiresAt, new Date())).returning({ id: verification.id });
  const limits = await db.delete(rateLimit).where(sql`${rateLimit.lastRequest} < ${dayAgo.getTime()}`).returning({ key: rateLimit.key });
  const sends = await db.delete(otpSends).where(lt(otpSends.sentAt, dayAgo)).returning({ id: otpSends.id });
  const buckets = await db.delete(rateLimitBuckets).where(lt(rateLimitBuckets.windowStart, expiredBucketsBefore(new Date()))).returning({ key: rateLimitBuckets.key });
  const summary = { raw, codes: codes.length, limits: limits.length, sends: sends.length, buckets: buckets.length };
  log.info("cron.sweep", summary);
  return NextResponse.json(summary);
}
