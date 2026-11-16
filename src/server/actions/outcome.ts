"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getDb } from "@/db";
import { type AnswerResult, answerFromLink } from "@/server/services/listing-outcome";

export type { AnswerResult };

/** An answer from the "still available?" email's link: the only write behind /outcome. No session: the signed token is the authorisation. */
export async function answerOutcomeAction(t: string, a: string): Promise<AnswerResult> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  const result = await answerFromLink(await getDb(), { t, a }, ip);
  // A taken listing leaves the board, a reopened one returns, and a confirmed one shows its date.
  if (result.ok && result.effect !== "gone" && result.effect !== "unchanged") for (const p of ["/browse", "/map", "/post", "/"]) revalidatePath(p);
  return result;
}
