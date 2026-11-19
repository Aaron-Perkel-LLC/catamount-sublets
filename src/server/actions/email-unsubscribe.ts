"use server";

import { getDb } from "@/db";
import { announceUnsubscribe } from "@/server/services/email";

/** The /unsubscribe page's confirm button for a group email's link. No session: the signed token is the authorisation. */
export async function announceUnsubscribeAction(token: string): Promise<{ ok: boolean }> {
  return announceUnsubscribe(await getDb(), typeof token === "string" ? token : "", "page");
}
