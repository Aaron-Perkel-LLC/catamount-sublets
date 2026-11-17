import type { Db } from "@/db";
import { GO_PUBLIC_AT, GO_PUBLIC_CRON_UNTIL } from "@/lib/visibility-rollout";
import { goPublic, type GoPublicReport } from "@/server/data/go-public";
import { log } from "@/server/log";

/**
 * go-public as the one-off cron runs it (/api/cron/go-public): the same
 * --apply as `npm run go-public`, but only inside its window (from
 * GO_PUBLIC_AT to the end of 22 Nov Eastern) and only when there is
 * something to flip. Every other run reads nothing it doesn't need and
 * changes nothing. The manual script stays the fallback.
 */

export type ScheduledGoPublic =
  | { acted: false; reason: "too_early" | "too_late" | "nothing_to_flip" }
  | { acted: true; report: GoPublicReport };

/** The counts and ids, as the script prints them and the cron logs them. Ids only, never an address. */
export function goPublicSummary(report: GoPublicReport) {
  return {
    count: report.ids.length,
    ids: report.ids.join(","),
    withoutArea: report.withoutArea.length,
    withoutAreaIds: report.withoutArea.join(","),
  };
}

export async function runScheduledGoPublic(db: Db, now: Date = new Date()): Promise<ScheduledGoPublic> {
  if (now.getTime() < GO_PUBLIC_AT.getTime()) return skipped("too_early");
  if (now.getTime() >= GO_PUBLIC_CRON_UNTIL.getTime()) return skipped("too_late");
  const report = await goPublic(db, { apply: true });
  if (!report.applied) return skipped("nothing_to_flip");
  log.info("go_public.applied", goPublicSummary(report));
  if (report.withoutArea.length) {
    log.warn("go_public.missing_area", { count: report.withoutArea.length, ids: report.withoutArea.join(","), note: "off the signed-out board until the daily sweep" });
  }
  return { acted: true, report };
}

function skipped(reason: "too_early" | "too_late" | "nothing_to_flip"): ScheduledGoPublic {
  log.info("go_public.skipped", { reason });
  return { acted: false, reason };
}
