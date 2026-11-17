import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { runDigest } from "@/server/services/digest";

export const runtime = "nodejs";
/** The run stops claiming people at RUN_BUDGET_MS (240 s); the next catch-up hour finishes the rest. */
export const maxDuration = 300;

/**
 * The weekly digest (vercel.json: every hour, on the hour). Vercel runs in
 * UTC, so the route decides for itself: it acts only on the digest morning,
 * Eastern, and only while the admin switch is on and nothing blocks it
 * (src/server/services/digest.ts). Every other firing returns at once.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return new NextResponse("Unauthorized", { status: 401 });
  const summary = await runDigest(await getDb());
  return NextResponse.json(summary);
}
