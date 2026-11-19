import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { recordCronRun } from "@/server/data/cron-runs";
import { runScheduledGoPublic } from "@/server/services/go-public";

export const runtime = "nodejs";

/**
 * The 21 Nov switch, once (vercel.json "5 5 21 11 *": 00:05 Eastern on
 * 21 Nov 2026; Vercel schedules in UTC and Eastern is UTC−5 then). Makes
 * public every listing that is signed-in only and whose poster never chose,
 * logging counts and ids (src/server/services/go-public.ts). Outside 21–22
 * Nov Eastern, or with nothing left to flip, it does nothing, so next
 * year's firing and a manual "Run" are harmless. `npm run go-public` is the fallback.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return new NextResponse("Unauthorized", { status: 401 });
  const db = await getDb();
  try {
    const result = await runScheduledGoPublic(db);
    if (result.acted) for (const p of ["/browse", "/map", "/post", "/"]) revalidatePath(p);
    const body = result.acted ? { acted: true, count: result.report.ids.length, withoutArea: result.report.withoutArea.length } : result;
    await recordCronRun(db, "go-public", true, body);
    return NextResponse.json(body);
  } catch (error) {
    await recordCronRun(db, "go-public", false, {});
    throw error;
  }
}
