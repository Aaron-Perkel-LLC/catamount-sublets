import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { recordCronRun } from "@/server/data/cron-runs";
import { resumeSending } from "@/server/services/email";

export const runtime = "nodejs";
/** A run stops claiming recipients at 240 s; the next hour finishes the rest. */
export const maxDuration = 300;

/**
 * The admin's email, picked up where a send left off (vercel.json: every
 * hour, at half past). Sending normally finishes in the request that
 * started it; this is for what didn't: a recipient whose send was cut off,
 * or one waiting for another try after a temporary failure. With nothing
 * still sending it returns at once. Nothing here starts an email.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return new NextResponse("Unauthorized", { status: 401 });
  const db = await getDb();
  try {
    const r = await resumeSending(db, { budgetMs: 240_000 });
    const summary = { ...r, acted: r.emails > 0 };
    await recordCronRun(db, "email", true, summary);
    return NextResponse.json(summary);
  } catch (error) {
    await recordCronRun(db, "email", false, {});
    throw error;
  }
}
