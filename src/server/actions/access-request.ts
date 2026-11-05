"use server";

import { headers } from "next/headers";
import { getDb } from "@/db";
import { type AccessRequestState, submitAccessRequest } from "@/server/services/access-request";

export type { AccessRequestState };

/** "Request your school" / "Request access" from the front page. No session needed. */
export async function requestAccessAction(_prev: AccessRequestState, formData: FormData): Promise<AccessRequestState> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  return submitAccessRequest(await getDb(), formData, ip);
}
