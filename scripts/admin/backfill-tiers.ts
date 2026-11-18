/**
 * Phase 31's post-deploy step. Migration 0013 goes on production before the
 * merge, so an account the old code creates between the migration and the
 * deploy has no tier set and gets the column default, community, even with a
 * school address. Run this once the deploy is Ready:
 *
 *   npm run backfill-tiers               # dry run (read-only): counts and ids, changes nothing
 *   npm run backfill-tiers -- --count    # the same read-only check (must say 0 to fix after --apply)
 *   npm run backfill-tiers -- --apply    # make those accounts students and sign them out
 *
 * Idempotent: a second --apply finds nothing. Prints counts and account ids,
 * never an address. A production write: --apply only on Aaron's go-ahead,
 * with production's DATABASE_URL exported.
 */
import { sql } from "drizzle-orm";
import { getDb } from "../../src/db";
import { tierBackfill } from "../../src/server/data/tier-backfill";

async function main() {
  const args = process.argv.slice(2);
  const unknown = args.filter((a) => a !== "--apply" && a !== "--count" && a !== "--dry-run");
  if (unknown.length) throw new Error(`unknown argument(s): ${unknown.join(" ")} (use --count, --dry-run or --apply)`);
  const apply = args.includes("--apply");
  if (apply && args.length > 1) throw new Error("--apply on its own, please.");
  const db = await getDb();
  const report = apply
    ? await tierBackfill(db, { apply: true })
    : await db.transaction(async (tx) => {
        await tx.execute(sql`set transaction read only`);
        return tierBackfill(tx, { apply: false });
      });
  console.log(`accounts: ${report.totals.student} student, ${report.totals.community} community (before any change)`);
  console.log(`community accounts with a school or approved address: ${report.wrong.length}`);
  for (const w of report.wrong) console.log(`  ${w.id} (${w.why})`);
  console.log(apply ? `made student and signed out: ${report.applied}` : "read-only; nothing changed.");
}

main().then(
  () => process.exit(process.exitCode ?? 0),
  (e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
