import { z } from "zod";
import { getDb } from "@/db";
import { getSessionUser } from "@/server/auth";
import { recordEvent } from "@/server/data/events";
import { sameOrigin } from "@/server/http";

export const runtime = "nodejs";

const input = z.object({
  type: z.string().max(20),
  listing_id: z.coerce.number().int().positive(),
  source: z.string().max(12).optional(),
  target: z.string().max(12).optional(),
});

/**
 * The activity beacon (src/lib/track.ts). Always 204, 429 when a person is
 * sending too much, nothing else: the server decides what counts and the
 * client never learns why something was dropped.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response(null, { status: 403 });
  const user = await getSessionUser();
  if (!user) return new Response(null, { status: 204 });
  let parsed;
  try {
    const form = await request.formData();
    parsed = input.safeParse(Object.fromEntries(form.entries()));
  } catch {
    return new Response(null, { status: 204 });
  }
  if (!parsed.success) return new Response(null, { status: 204 });
  const result = await recordEvent(await getDb(), user, {
    listingId: parsed.data.listing_id,
    type: parsed.data.type,
    source: parsed.data.source,
    target: parsed.data.target,
  });
  return new Response(null, { status: result === "limited" ? 429 : 204 });
}
