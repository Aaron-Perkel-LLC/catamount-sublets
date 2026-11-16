/**
 * After the stale-notice deadline: remove each migrated poster who was sent
 * the notice and has still never signed in, account and listing together
 * (src/server/services/stale.ts removeStale, through deletePerson: the
 * delete-user path, photos and events included). Nothing is written to
 * listing_outcomes. Dry run by default; prints counts only. --apply removes
 * and appends one line per person to DELETIONS_LOG (default
 * ~/sublet-migration/deletions.log) with ids, never the address.
 *
 *   npm run remove-stale -- --deadline 2026-11-20                            # dry run (any time)
 *   npm run remove-stale -- --deadline 2026-11-20 --apply                    # only after 11:59:59 pm Eastern that day
 *   npm run remove-stale -- --deadline 2026-11-20 --include-unmailed --apply # also addresses on suppressed.txt
 *
 * Who goes: the audience recomputed now (anyone who signed in since the
 * notice drops out), limited to the user ids in the notice log
 * (~/sublet-migration/stale-notice.log). --include-unmailed adds only
 * audience members on suppressed.txt; Stop-email accounts, skip.txt and
 * failed sends are always kept.
 *
 * A production deletion: run --apply only on an explicit go-ahead, with
 * production's DATABASE_URL exported.
 */
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { getDb } from "../../src/db";
import { assertIsoDate, easternDayStart, easternDeadlinePassed, nextDate } from "../../src/lib/dates";
import { removeStale } from "../../src/server/services/stale";
import { DELETIONS_LOG, NOTICE_LOG, SKIP, SUPPRESSED, argAfter, columnIn, exists } from "./stale-files";

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const includeSuppressed = args.includes("--include-unmailed");
  const deadlineArg = argAfter(args, "--deadline");
  if (!deadlineArg) throw new Error("--deadline YYYY-MM-DD is required (the Eastern date the notice named)");
  const deadline = assertIsoDate(deadlineArg);
  const passesAt = easternDayStart(nextDate(deadline));
  console.log(`deadline: end of ${deadline} Eastern (passes at ${passesAt.toISOString()}); ${easternDeadlinePassed(deadline) ? "passed" : "not yet passed"}`);
  if (apply && !easternDeadlinePassed(deadline)) throw new Error(`refusing --apply before ${passesAt.toISOString()} (00:00 Eastern the day after the deadline). Nothing removed.`);
  if (!(await exists(NOTICE_LOG))) throw new Error(`${NOTICE_LOG} is missing, so nobody is known to have been told. Nothing removed.`);
  if (includeSuppressed && !(await exists(SUPPRESSED))) throw new Error(`--include-unmailed needs ${SUPPRESSED}. Nothing removed.`);

  const db = await getDb();
  const mailedIds = await columnIn(NOTICE_LOG, 2);
  if (apply) await mkdir(path.dirname(DELETIONS_LOG), { recursive: true, mode: 0o700 });
  const report = await removeStale(
    db,
    { mailedIds, skip: await columnIn(SKIP), suppressed: await columnIn(SUPPRESSED), includeSuppressed, apply },
    async (r) => {
      await appendFile(DELETIONS_LOG, `${new Date().toISOString()} removed-stale user=${r.userId} listing=${r.listingId ?? "-"} photos=${r.photos} events=${r.events}\n`, { mode: 0o600 });
    },
  );

  console.log(`${mailedIds.size} id(s) in the notice log; ${report.audience} account(s) still never signed in with a listing`);
  console.log(`kept: ${report.keptNoEmail} asked for no email, ${report.keptSkip} on skip.txt, ${report.keptUnmailed} not mailed${includeSuppressed ? "" : " (suppressed addresses kept; --include-unmailed removes them)"}`);
  console.log(`${apply ? "removed" : "would remove"}: ${report.removed} account(s) and listing(s), ${report.photos} photo(s), ${report.events} event(s); ${report.droppedAtRecheck} dropped at the re-check, ${report.failed} failed`);
  console.log(apply ? `logged ids to ${DELETIONS_LOG}` : "dry run; nothing removed.");
}

main().then(
  () => process.exit(process.exitCode ?? 0),
  (e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
