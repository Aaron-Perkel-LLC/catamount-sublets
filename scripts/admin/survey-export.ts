/**
 * The feedback survey's answers as a CSV, with the addresses, for Aaron's
 * own reading (the admin page shows first names only). Written to
 * SURVEY_EXPORT_DIR (default ~/sublet-migration) as survey-<date>.csv, mode
 * 0600, or to stdout with --stdout. The summary is printed either way.
 *
 *   npm run survey-export
 *   npm run survey-export -- --stdout
 */
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { getDb } from "../../src/db";
import { toCsv } from "../../src/lib/csv";
import { easternDate } from "../../src/lib/dates";
import { SURVEY_QUESTIONS } from "../../src/lib/survey";
import { surveyExportRows, surveySummary } from "../../src/server/data/survey";

const DIR = process.env.SURVEY_EXPORT_DIR ?? path.join(homedir(), "sublet-migration");

async function main() {
  const stdout = process.argv.includes("--stdout");
  const db = await getDb();
  const rows = await surveyExportRows(db);
  const csv = toCsv([
    ["id", "answered_at", "email", "first_name", "migrated", "posted", "used", "outcome", "overall", "useful", "signin", "vs_legacy", "problems", "missing", "recommend", "lejer", "followup"],
    ...rows.map((r) => [
      r.id,
      r.answeredAt.toISOString(),
      r.email,
      r.firstName,
      r.migrated,
      r.posted,
      r.used,
      r.outcome,
      r.overall,
      r.useful.join(";"),
      r.signin,
      r.vsLegacy,
      r.problems,
      r.missing,
      r.recommend,
      r.lejer,
      r.followup,
    ]),
  ]);

  if (stdout) {
    process.stdout.write(csv);
  } else {
    await mkdir(DIR, { recursive: true, mode: 0o700 });
    const file = path.join(DIR, `survey-${easternDate(new Date())}.csv`);
    await writeFile(file, csv, { mode: 0o600 });
    console.log(`${rows.length} answer(s) written to ${file}`);
  }

  const s = await surveySummary(db);
  const out = stdout ? console.error : console.log;
  out(`answered ${s.answered}, ${s.notYet} not yet on the site, ${s.followup} OK to follow up; overall ${s.overall.average ?? "–"}, recommend ${s.recommend.average ?? "–"}`);
  for (const key of ["used", "outcome", "useful", "signin", "vsLegacy", "lejer"] as const) {
    out(`${SURVEY_QUESTIONS[key].label} ${s[key].map((t) => `${t.label} ${t.n} (${t.pct}%)`).join(" · ")}`);
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
