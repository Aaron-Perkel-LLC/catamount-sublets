/**
 * The feedback survey invitation to every account (banned accounts, admins
 * and test addresses left out: src/server/data/survey.ts surveyAudience, the
 * same list the admin page counts as "invited"). Dry run by default: prints
 * the mail mode, the link base, a fingerprint of the signing secret, who
 * would get it and who is left out. --apply sends, one message a second so
 * sign-in codes are never queued behind it, most recently signed in first,
 * and appends `time, address, user id, Resend id` to SURVEY_LOG (default
 * ~/sublet-migration/survey.log) so a re-run skips everyone already mailed.
 *
 *   npm run send-survey                       # dry run
 *   npm run send-survey -- --review           # TSV: who, migrated, posted, last sign-in, idle days, flag
 *   npm run send-survey -- --link me@x.edu    # print that account's signed link; nothing sent
 *   npm run send-survey -- --to me@x.edu      # one real message to that account (it must exist here)
 *   npm run send-survey -- --apply            # send to everyone not yet mailed, skipped or suppressed
 *
 * Links are signed with SURVEY_SECRET (the survey's own secret, never
 * APP_SECRET; read from .env.local) and point at SURVEY_BASE_URL (default the
 * production URL). They only verify on the deployment that has the same
 * secret and the same accounts, so: a production run exports production's
 * DATABASE_URL and takes SURVEY_SECRET and RESEND_API_KEY from .env.local; a
 * preview test needs SURVEY_SECRET set to the preview's value, the rehearsal
 * DATABASE_URL and SURVEY_BASE_URL set to the preview. Without SURVEY_SECRET,
 * --to and --apply refuse: the links would be dead.
 *
 * Skips: addresses in ~/sublet-migration/suppressed.txt (Resend's suppression
 * list, copied from the dashboard) and ~/sublet-migration/skip.txt (Aaron's
 * own choices). Bounce stop: with RESEND_ADMIN_API_KEY (a full-access key)
 * each sent message is polled as the run goes and the run stops after more
 * than MAX_BOUNCES; without it --apply needs --without-bounce-check.
 *
 * Sending is external and visible to real people: run --to and --apply only
 * on an explicit go-ahead.
 */
import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { SITE } from "../../src/config/site";
import { getDb } from "../../src/db";
import { listings, user } from "../../src/db/schema";
import SurveyInviteEmail, { SURVEY_SUBJECT } from "../../src/emails/survey-invite";
import { posterFirstName } from "../../src/lib/person-name";
import { type SurveyAudienceRow, surveyAudience } from "../../src/server/data/survey";
import { mailMode, sendMail } from "../../src/server/email/send";
import { signSurveyToken, surveySecret } from "../../src/server/survey-token";

const DIR = path.join(homedir(), "sublet-migration");
const LOG = process.env.SURVEY_LOG ?? path.join(DIR, "survey.log");
const SUPPRESSED = path.join(DIR, "suppressed.txt");
const SKIP = path.join(DIR, "skip.txt");
const BASE = (process.env.SURVEY_BASE_URL ?? SITE.url).replace(/\/+$/, "");
const MAX_BOUNCES = 2;
const PACE_MS = 1000;

async function addressesIn(file: string, column = 0): Promise<Set<string>> {
  try {
    const text = await readFile(file, "utf8");
    return new Set(
      text
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#"))
        .map((l) => l.split("\t")[column]?.trim().toLowerCase())
        .filter((s): s is string => Boolean(s)),
    );
  } catch {
    return new Set();
  }
}

const linkFor = (r: { id: string }) => `${BASE}/survey?t=${signSurveyToken(r.id)}`;
const idleDays = (r: SurveyAudienceRow) => (r.lastLoginAt ? Math.floor((Date.now() - r.lastLoginAt.getTime()) / 86_400_000) : null);
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
const mailFor = (r: SurveyAudienceRow) => SurveyInviteEmail({ name: r.firstName ?? "", link: linkFor(r), posted: r.posted });

/** Any account by address (the admin's own, say, for a test), shaped like an audience row. */
async function accountFor(email: string): Promise<SurveyAudienceRow | null> {
  const db = await getDb();
  const [r] = await db
    .select({ id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, name: user.name, legacyNetid: user.legacyNetid, displayName: listings.displayName, listingId: listings.id, lastLoginAt: user.lastLoginAt, createdAt: user.createdAt })
    .from(user)
    .leftJoin(listings, eq(listings.userId, user.id))
    .where(eq(user.email, email));
  if (!r) return null;
  return { id: r.id, email: r.email, firstName: posterFirstName({ ...r, legacyNames: [r.displayName, r.name] }), migrated: r.legacyNetid !== null, posted: r.listingId !== null, lastLoginAt: r.lastLoginAt, createdAt: r.createdAt };
}

/** Resend's view of one sent message, through the full-access key. */
async function lastEvent(adminKey: string, id: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.resend.com/emails/${id}`, { headers: { Authorization: `Bearer ${adminKey}`, "User-Agent": "catamount-sublets/1.0" } });
    if (!res.ok) return null;
    return ((await res.json()) as { last_event?: string }).last_event ?? null;
  } catch {
    return null;
  }
}

function addressArg(args: string[], flag: string): string | null {
  const i = args.indexOf(flag);
  if (i < 0) return null;
  const v = args[i + 1]?.trim().toLowerCase();
  if (!v) throw new Error(`${flag} needs an address`);
  return v;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const review = args.includes("--review");
  const linkTo = addressArg(args, "--link");
  const testTo = addressArg(args, "--to");
  // The dry run reports the mode --apply would run in; nothing is sent until --apply or --to.
  process.env.MAIL_LIVE = "1";
  const mode = mailMode();
  const realSecret = Boolean(process.env.SURVEY_SECRET);
  const secret = surveySecret();
  if (!secret) throw new Error("SURVEY_SECRET is not set; nothing to sign links with");
  console.log(`mail: ${mode}${mode === "resend" ? " (key present; messages go out through Resend)" : ""}`);
  console.log(`base: ${BASE}`);
  console.log(`secret: ${createHash("sha256").update(secret).digest("hex").slice(0, 8)} ${realSecret ? "(SURVEY_SECRET; links verify where the deployment has the same value)" : "(development fallback: SURVEY_SECRET is not set, so links will not verify on any deployment)"}`);

  if (linkTo) {
    const r = await accountFor(linkTo);
    if (!r) throw new Error(`${linkTo} has no account here`);
    console.log(linkFor(r));
    return;
  }

  if (testTo) {
    if (mode !== "resend") throw new Error("no RESEND_API_KEY; nothing sent");
    if (!realSecret) throw new Error("SURVEY_SECRET is not set (put the deployment's value in .env.local), so the link would be dead; nothing sent");
    const r = await accountFor(testTo);
    if (!r) throw new Error(`${testTo} has no account here; the link needs one`);
    const result = await sendMail({ to: r.email, subject: SURVEY_SUBJECT, react: mailFor(r), kind: "survey_invite", ref: r.id });
    console.log(result.ok ? `sent test to ${r.email} (Resend id ${result.id})` : `failed: ${r.email}`);
    return;
  }

  const rows = await surveyAudience(await getDb());
  const done = await addressesIn(LOG, 1);
  const suppressed = await addressesIn(SUPPRESSED);
  const skip = await addressesIn(SKIP);
  const todo = rows.filter((r) => !done.has(r.email) && !suppressed.has(r.email) && !skip.has(r.email));
  const left = rows.filter((r) => !todo.includes(r));

  if (review) {
    console.log("email\tfirst\tmigrated\tposted\tlast_login\tidle_days\tflag");
    for (const r of rows) {
      const idle = idleDays(r);
      const flag = idle === null ? "never signed in" : idle > 90 ? "idle > 90 d" : "";
      console.log([r.email, r.firstName ?? "", r.migrated ? "yes" : "", r.posted ? "yes" : "", day(r.lastLoginAt), idle ?? "", flag].join("\t"));
    }
    return;
  }

  console.log(`${rows.length} account(s) invited: ${todo.length} to send, ${done.size} already mailed, ${suppressed.size} on the suppression file, ${skip.size} on the skip file; banned, admins and test addresses left out`);
  console.log("order: most recently signed in first");
  for (const r of todo) console.log(`  ${r.email}  ${r.lastLoginAt ? `signed in ${day(r.lastLoginAt)}` : "never signed in"}${r.posted ? "  (listing)" : ""}${r.migrated ? "  (migrated)" : ""}`);
  if (left.length) console.log(`left out: ${left.map((r) => r.email).join(", ")}`);
  if (!apply) {
    console.log(`dry run; nothing sent. --apply would ${mode === "resend" && realSecret ? "send via Resend" : `refuse: ${mode !== "resend" ? `mail mode is ${mode}` : "SURVEY_SECRET is not set"}`}.`);
    return;
  }
  if (mode !== "resend") throw new Error(`mail mode is ${mode}; --apply needs RESEND_API_KEY`);
  if (!realSecret) throw new Error("SURVEY_SECRET is not set (put the deployment's value in .env.local), so every link would be dead; nothing sent");

  const adminKey = process.env.RESEND_ADMIN_API_KEY;
  if (!adminKey && !args.includes("--without-bounce-check")) {
    throw new Error("no RESEND_ADMIN_API_KEY, so bounces cannot be watched; add one (full access) or pass --without-bounce-check");
  }

  await mkdir(path.dirname(LOG), { recursive: true, mode: 0o700 });
  const sentIds: string[] = [];
  const bounced = new Set<string>();
  const checkBounces = async () => {
    if (!adminKey) return;
    for (const id of sentIds) {
      if (bounced.has(id)) continue;
      const ev = await lastEvent(adminKey, id);
      if (ev === "bounced" || ev === "complained") bounced.add(id);
    }
  };

  let sent = 0;
  let failed = 0;
  for (const [i, r] of todo.entries()) {
    if (i > 0 && i % 3 === 0) await checkBounces();
    if (bounced.size > MAX_BOUNCES) {
      console.log(`STOP: ${bounced.size} bounce(s), more than ${MAX_BOUNCES}. ${sent} sent, ${todo.length - i} not sent. Check the Resend dashboard before resuming; a re-run skips everyone already mailed.`);
      break;
    }
    const result = await sendMail({ to: r.email, subject: SURVEY_SUBJECT, react: mailFor(r), kind: "survey_invite", ref: r.id });
    if (result.ok) {
      sent++;
      if (result.id) sentIds.push(result.id);
      await appendFile(LOG, `${new Date().toISOString()}\t${r.email}\t${r.id}\t${result.id ?? ""}\n`, { mode: 0o600 });
    } else {
      failed++;
      console.log(`  failed: ${r.email}`);
    }
    await new Promise((res) => setTimeout(res, PACE_MS));
  }
  if (adminKey) {
    await new Promise((res) => setTimeout(res, 10_000));
    await checkBounces();
  }
  console.log(`sent ${sent}, failed ${failed}, bounced so far ${bounced.size}${adminKey ? "" : " (not watched)"}; log: ${LOG}`);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
