"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { listings } from "@/db/schema";
import { requireUserOrThrow } from "@/server/auth";
import { dismissNotice } from "@/server/data/notices";
import { log } from "@/server/log";

const dismissInput = z.object({ noticeId: z.number().int().positive(), how: z.enum(["dismiss", "cta"]) });

/** A signed-in person's Got it (or Escape, the backdrop, the CTA): the popup stops showing to them, and it is counted. */
export async function dismissNoticeAction(noticeId: number, how: "dismiss" | "cta"): Promise<void> {
  const user = await requireUserOrThrow();
  const input = dismissInput.parse({ noticeId, how });
  const db = await getDb();
  const [mine] = await db.select({ id: listings.id }).from(listings).where(eq(listings.userId, user.id)).limit(1);
  const r = await dismissNotice(db, { kind: "signed-in", userId: user.id, role: user.role, hasListing: Boolean(mine) }, input.noticeId, input.how);
  if (r !== "dismissed") log.warn("notice.dismiss_invalid", { noticeId: input.noticeId });
}
