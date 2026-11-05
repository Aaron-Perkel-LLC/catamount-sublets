"use server";

import { headers } from "next/headers";
import { getDb } from "@/db";
import { type SurveyState, submitSurvey } from "@/server/services/survey";

export type { SurveyState };

/** The feedback survey, answered through the signed link in the invitation. No session needed. */
export async function submitSurveyAction(_prev: SurveyState, formData: FormData): Promise<SurveyState> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  return submitSurvey(await getDb(), formData, ip);
}
