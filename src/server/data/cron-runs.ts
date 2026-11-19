import "server-only";
import { sql } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { siteSettings } from "@/db/schema";
import { log } from "@/server/log";
import type { CronRun } from "./settings";

export const CRON_NAMES = ["sweep", "digest", "go-public"] as const;
export type CronName = (typeof CRON_NAMES)[number];

/**
 * The summary's counts and short state words, flattened one level
 * ("skipped.banned"): numbers, booleans, and strings of up to 40 characters
 * that are plain words (a reason, a week), so nothing personal can ride along.
 */
export function cronSummary(value: unknown, prefix = ""): CronRun["summary"] {
  const out: CronRun["summary"] = {};
  if (!value || typeof value !== "object") return out;
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const key = `${prefix}${k}`;
    if (typeof v === "number" || typeof v === "boolean") out[key] = v;
    else if (typeof v === "string" && v.length <= 40 && /^[\w .:-]*$/.test(v) && !v.includes("@")) out[key] = v;
    else if (v && typeof v === "object" && !Array.isArray(v) && !prefix) Object.assign(out, cronSummary(v, `${key}.`));
    else if (Array.isArray(v)) out[`${key}.count`] = v.length;
  }
  return out;
}

/**
 * Records a cron's run in site_settings.cron_runs, one key per cron, merged
 * in one statement so two crons finishing together can't overwrite each
 * other. Never throws: a failed record must not fail the cron.
 */
export async function recordCronRun(db: DbOrTx, name: CronName, ok: boolean, summary: unknown, at: Date = new Date()): Promise<void> {
  const run: CronRun = { at: at.toISOString(), ok, summary: cronSummary(summary) };
  const patch = JSON.stringify({ [name]: run });
  try {
    await db.execute(sql`
      insert into ${siteSettings} (key, value) values ('cron_runs', ${patch}::jsonb)
      on conflict (key) do update set value = ${siteSettings.value} || ${patch}::jsonb, updated_at = now()`);
  } catch (error) {
    log.error("cron.record_failed", error, { name });
  }
}
