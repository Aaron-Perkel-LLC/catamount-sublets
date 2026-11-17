/**
 * The 21 Nov switch promised in the 17 Nov email to every poster: each
 * listing that is signed-in only and whose poster never chose
 * (visibility_chosen_at null) becomes visible to signed-out visitors.
 * Nothing else changes (src/server/data/go-public.ts). Prints counts and
 * listing ids, never an address. Running it again finds nothing.
 *
 *   npm run go-public                # dry run (the default; --dry-run says so explicitly), any time
 *   npm run go-public -- --apply     # only from 00:00 Eastern on 21 Nov 2026 (GO_PUBLIC_AT)
 *
 * The area that puts a listing on the signed-out board needs APP_SECRET,
 * which only the deployment has, so the daily sweep fills it in; the report
 * names any listing still without one (it stays off the signed-out board,
 * failing closed, until the next sweep at 04:20 Eastern).
 *
 * The fallback: /api/cron/go-public runs the same --apply at 00:05 Eastern
 * on 21 Nov and logs the same counts and ids (go_public.applied). Run this
 * if that log line is missing. A production write: --apply only on Aaron's
 * go-ahead, with production's DATABASE_URL exported.
 */
import { getDb } from "../../src/db";
import { GO_PUBLIC_AT, GO_PUBLIC_DAY } from "../../src/lib/visibility-rollout";
import { goPublic } from "../../src/server/data/go-public";
import { goPublicSummary } from "../../src/server/services/go-public";

async function main() {
  const args = process.argv.slice(2);
  const unknown = args.filter((a) => a !== "--apply" && a !== "--dry-run");
  if (unknown.length) throw new Error(`unknown argument(s): ${unknown.join(" ")} (use --dry-run or --apply)`);
  if (args.includes("--apply") && args.includes("--dry-run")) throw new Error("--apply and --dry-run together; pick one.");
  const apply = args.includes("--apply");
  const now = new Date();
  console.log(`go-public day: ${GO_PUBLIC_DAY} Eastern (from ${GO_PUBLIC_AT.toISOString()}); now ${now.toISOString()}`);
  if (apply && now.getTime() < GO_PUBLIC_AT.getTime()) {
    throw new Error(`refusing --apply before ${GO_PUBLIC_AT.toISOString()}: posters were told they have until ${GO_PUBLIC_DAY}. Nothing changed.`);
  }

  const summary = goPublicSummary(await goPublic(await getDb(), { apply }));
  console.log(`${apply ? "made public" : "would make public"}: ${summary.count} listing(s): ${summary.ids || "none"}`);
  console.log(`of those, without an approximate area yet (off the signed-out board until the daily sweep): ${summary.withoutArea}: ${summary.withoutAreaIds || "none"}`);
  console.log(apply ? "done." : "dry run; nothing changed. Add --apply on the go-public day.");
}

main().then(
  () => process.exit(process.exitCode ?? 0),
  (e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
