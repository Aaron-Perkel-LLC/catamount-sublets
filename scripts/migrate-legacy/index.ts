/**
 * The one-off import from UVM Sublets. PLAN.md §3 is the specification;
 * README.md in this directory has the exact commands.
 *
 *   --source dump|mysql   where the legacy rows come from (default dump)
 *   --dump <file>         the SQL dump (rehearsals)
 *   --mysql-url <url>     mysql://user:pass@127.0.0.1:3306/db through the SSH tunnel (final sync)
 *   --images-dir <dir>    the rsynced originals
 *   --opt-outs <file>     NetIDs or emails to leave out, one per line
 *   --apply               write rows (default is a dry run)
 *   --images              process and upload photos (with --apply)
 *   --prune               delete migrated rows the source no longer has (with --apply)
 *   --verify              compare every row and file afterwards
 *   --fetch-images        during --verify, download each original and compare hashes
 *
 * Secrets, from the environment (never written anywhere):
 *   LEGACY_SHARE_SECRET / LEGACY_DBPASS   the old site's share secret candidates
 *   LEGACY_SHARE_SAMPLE                   one real share URL from the old site, to tell which is in use
 *   DATABASE_URL                          the target (unset = local PGlite in PGLITE_DATA_DIR)
 */
import { readFile } from "node:fs/promises";
import { getDb } from "../../src/db";
import { applyPlan, migrateImages, planDiff, verifyMigration } from "./apply";
import { readDumpFile, readMysql } from "./sources";
import { buildPlan, legacyShareToken, parseOptOuts } from "./transform";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}
const flag = (name: string) => process.argv.includes(`--${name}`);

function resolveShareSecret(): string | null {
  const candidates = [process.env.LEGACY_SHARE_SECRET, process.env.LEGACY_DBPASS].filter((s): s is string => Boolean(s));
  if (candidates.length === 0) return null;
  const sample = process.env.LEGACY_SHARE_SAMPLE;
  if (!sample) {
    if (candidates.length === 1) return candidates[0];
    throw new Error("two secret candidates and no LEGACY_SHARE_SAMPLE to tell them apart");
  }
  const m = /\/s\/(\d+)-([a-f0-9]{10})/.exec(sample);
  if (!m) throw new Error("LEGACY_SHARE_SAMPLE is not a share URL");
  const hit = candidates.find((c) => legacyShareToken(Number(m[1]), c) === m[2]);
  if (!hit) throw new Error("neither candidate secret reproduces the sample share token; the old site must be using something else");
  return hit;
}

async function main() {
  const source = arg("source") ?? "dump";
  const data = source === "mysql" ? await readMysql(required("mysql-url")) : await readDumpFile(required("dump"));
  const optOuts = arg("opt-outs") ? parseOptOuts(await readFile(arg("opt-outs")!, "utf8")) : new Set<string>();
  const secret = resolveShareSecret();
  if (!secret) console.warn("no legacy share secret given: old share links will not keep working");

  const plan = buildPlan(data, { optOuts, shareSecret: secret });
  const db = await getDb();
  const apply = flag("apply");

  console.log(`source: ${source} — ${data.sublets.length} listings, ${data.sublet_images.length} photos, ${data.semesters.length} semesters, ${data.semester_archives.length} archives`);
  console.log(`opt-outs: ${optOuts.size} entries → ${plan.excluded.netids.length} poster(s), ${plan.excluded.listingIds.length} listing(s) left out`);
  for (const w of plan.warnings) console.log(`warning: ${w}`);
  const diff = await planDiff(db, plan);
  console.log("plan:", JSON.stringify({ users: diff.users, listings: { ...diff.listings, wouldDelete: diff.listings.wouldDelete.length }, photos: diff.photos, semesters: diff.semesters, archives: diff.archives }, null, 1));
  if (diff.listings.wouldDelete.length) console.log(`listings --prune would delete: ${diff.listings.wouldDelete.join(", ")}`);

  if (!apply) {
    console.log("dry run; nothing written. Add --apply to write rows, --images to upload photos, --prune to delete what the source no longer has.");
  } else {
    const report = await applyPlan(db, plan, { prune: flag("prune") });
    console.log("applied:", JSON.stringify(report));
    if (flag("images")) {
      const images = await migrateImages(db, plan, required("images-dir"));
      console.log("images:", JSON.stringify({ ...images, missing: images.missing.length, failed: images.failed.length }));
      for (const m of images.missing) console.log(`  missing file for photo ${m.photoId} (listing ${m.listingId}): ${m.path}`);
      for (const f of images.failed) console.log(`  failed photo ${f.photoId}: ${f.error}`);
    }
  }

  if (flag("verify") || !apply) {
    const v = await verifyMigration(db, data, plan, arg("images-dir") ?? null, { fetchImages: flag("fetch-images") });
    console.log("counts:", JSON.stringify(v.counts));
    if (v.problems.length) {
      console.log(`${v.problems.length} problem(s):`);
      for (const p of v.problems) console.log(`  - ${p}`);
      if (apply || flag("verify")) process.exitCode = 1;
    } else console.log("verify: no problems");
  }
}

function required(name: string): string {
  const v = arg(name);
  if (!v) throw new Error(`--${name} is required`);
  return v;
}

main().then(
  () => process.exit(process.exitCode ?? 0),
  (e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
