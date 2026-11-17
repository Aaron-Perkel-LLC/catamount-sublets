import { z } from "zod";
import { getDb } from "@/db";
import { getSessionUser } from "@/server/auth";
import { isBot } from "@/lib/bots";
import { eq } from "drizzle-orm";
import { listings } from "@/db/schema";
import { anonymousActorKey, recordAnonymousView, recordEvent } from "@/server/data/events";
import { recordNoticeEvent } from "@/server/data/notices";
import { RATE_LIMITS, takeRateLimit } from "@/server/rate-limit";
import { clientIp, sameOrigin } from "@/server/http";

export const runtime = "nodejs";

const input = z.object({
  type: z.string().max(20),
  listing_id: z.coerce.number().int().positive(),
  source: z.string().max(12).optional(),
  target: z.string().max(12).optional(),
});

/** A popup notice's count: a view from anyone, a dismissal or CTA click from a signed-out visitor (signed in, those go with the dismissal's Server Action). */
const noticeInput = z.object({
  notice_type: z.enum(["view", "dismiss", "cta"]),
  notice_id: z.coerce.number().int().positive(),
});

/**
 * The activity beacon (src/lib/track.ts). Always 204, 429 when a person is
 * sending too much, nothing else: the server decides what counts and the
 * client never learns why something was dropped. A signed-out visitor can
 * record a listing view and nothing else; bots are not counted.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response(null, { status: 403 });
  const user = await getSessionUser();
  let fields: Record<string, FormDataEntryValue>;
  try {
    fields = Object.fromEntries((await request.formData()).entries());
  } catch {
    return new Response(null, { status: 204 });
  }
  if ("notice_id" in fields) return noticeEvent(request, user, fields);
  const parsed = input.safeParse(fields);
  if (!parsed.success) return new Response(null, { status: 204 });
  if (!user) {
    const userAgent = request.headers.get("user-agent") ?? "";
    if (parsed.data.type !== "listing_open" || isBot(userAgent)) return new Response(null, { status: 204 });
    const result = await recordAnonymousView(await getDb(), {
      listingId: parsed.data.listing_id,
      source: parsed.data.source,
      ip: clientIp(request), // keys the view (anonymousActorKey); never stored or logged
      userAgent,
    });
    return new Response(null, { status: result === "limited" ? 429 : 204 });
  }
  const result = await recordEvent(await getDb(), user, {
    listingId: parsed.data.listing_id,
    type: parsed.data.type,
    source: parsed.data.source,
    target: parsed.data.target,
  });
  return new Response(null, { status: result === "limited" ? 429 : 204 });
}

/** Counted only for a live notice whose audience takes in this person (recordNoticeEvent); bots and admins are not counted. */
async function noticeEvent(request: Request, user: Awaited<ReturnType<typeof getSessionUser>>, fields: Record<string, FormDataEntryValue>): Promise<Response> {
  const parsed = noticeInput.safeParse(fields);
  if (!parsed.success) return new Response(null, { status: 204 });
  const { notice_type: type, notice_id: noticeId } = parsed.data;
  const db = await getDb();
  if (!user) {
    const userAgent = request.headers.get("user-agent") ?? "";
    if (isBot(userAgent)) return new Response(null, { status: 204 });
    const ip = clientIp(request); // keys the count (anonymousActorKey) and the limit, hashed; never stored or logged
    if (!(await takeRateLimit(db, RATE_LIMITS.noticeEventPerIp, ip)).allowed) return new Response(null, { status: 429 });
    await recordNoticeEvent(db, { kind: "signed-out", anonKey: anonymousActorKey(ip, userAgent) }, noticeId, type);
    return new Response(null, { status: 204 });
  }
  if (type !== "view") return new Response(null, { status: 204 });
  const [mine] = await db.select({ id: listings.id }).from(listings).where(eq(listings.userId, user.id)).limit(1);
  await recordNoticeEvent(db, { kind: "signed-in", userId: user.id, role: user.role, hasListing: Boolean(mine) }, noticeId, type);
  return new Response(null, { status: 204 });
}
