import { SurveyTab } from "@/components/admin/SurveyTab";
import { getDb } from "@/db";
import { requireAdminPage } from "@/server/auth";
import { listSurveyText, surveyAudience, surveySummary } from "@/server/data/survey";

/** The feedback survey's answers: response rate, tallies and what people wrote. */
export default async function AdminSurvey() {
  await requireAdminPage("/admin/survey");
  const db = await getDb();
  const [summary, text, invited] = await Promise.all([surveySummary(db), listSurveyText(db), surveyAudience(db)]);
  return <SurveyTab survey={{ invited: invited.length, summary, text: text.map((t) => ({ ...t, answeredAt: t.answeredAt.toISOString() })) }} />;
}
