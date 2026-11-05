/**
 * The cutover-day welcome mail to every migrated poster (PLAN.md §6.3 step 9).
 * Dry run by default: prints the mail mode, who would get it and in what
 * order, and who is skipped. --apply sends, one message a second so sign-in
 * codes are never queued behind it, most recently active posters first, and
 * appends `time, address, listing id, Resend id` to WELCOME_LOG (default
 * ~/sublet-migration/welcome.log) so a re-run skips everyone already mailed.
 *
 *   npm run send-welcome                      # dry run
 *   npm run send-welcome -- --review          # the activity table (idle days, semesters) for deciding who to skip
 *   npm run send-welcome -- --to me@x.edu     # one test message to that address
 *   npm run send-welcome -- --apply           # send to everyone not yet mailed, skipped or suppressed
 *
 * Skips: addresses in ~/sublet-migration/suppressed.txt (Resend's suppression
 * list, copied from the dashboard; the script cannot read it with a
 * sending-only key) and in ~/sublet-migration/skip.txt (Aaron's own choices).
 *
 * Bounce stop: with RESEND_ADMIN_API_KEY in .env.local (a full-access key),
 * every sent message's status is polled as the run goes and the run stops
 * once more than MAX_BOUNCES have bounced. Without it the run refuses to
 * start unless --without-bounce-check is given.
 *
 * Sending is external and visible to real people: run --apply only on an
 * explicit go-ahead, after the smoke test, with writes enabled.
 */
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { eq, isNotNull, sql } from "drizzle-orm";
import { getDb } from "../../src/db";
import { listings, user } from "../../src/db/schema";
import WelcomeEmail from "../../src/emails/welcome";
import { LEGACY, SITE } from "../../src/config/site";
import { isTestAddress, mailMode, sendMail } from "../../src/server/email/send";

/** Plain, no capitals shouting, no exclamation marks: a note from a person, which is what it is. */
const WELCOME_SUBJECT = `${LEGACY.name} has moved to ${SITE.domain}`;
const DIR = path.join(homedir(), "sublet-migration");
const LOG = process.env.WELCOME_LOG ?? path.join(DIR, "welcome.log");
const SUPPRESSED = path.join(DIR, "suppressed.txt");
const SKIP = path.join(DIR, "skip.txt");
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

interface Row {
  id: string;
  email: string;
  role: string | null;
  listingId: number | null;
  firstName: string | null;
  status: string | null;
  posted: Date | null;
  changed: Date | null;
  lastActive: Date | null;
  semesters: string | null;
}

/** Migrated accounts, most recently active first (a post or a status change on their listing). */
async function recipients(): Promise<Row[]> {
  const db = await getDb();
  const lastActive = sql<Date | null>`greatest(${listings.postedAt}, coalesce(${listings.statusChangedAt}, ${listings.postedAt}))`;
  return db
    .select({
      id: user.id,
      email: user.email,
      role: user.role,
      listingId: listings.id,
      firstName: user.firstName,
      status: listings.status,
      posted: listings.postedAt,
      changed: listings.statusChangedAt,
      lastActive,
      semesters: sql<string | null>`(select string_agg(ls.semester_code || case when s.active then '' else ' (closed)' end, ', ' order by ls.position) from listing_semesters ls join semesters s on s.code = ls.semester_code where ls.listing_id = ${listings.id})`,
    })
    .from(user)
    .leftJoin(listings, eq(listings.userId, user.id))
    .where(isNotNull(user.legacyNetid))
    .orderBy(sql`${lastActive} desc nulls last`, user.email);
}

const idleDays = (r: Row) => (r.lastActive ? Math.floor((Date.now() - new Date(r.lastActive).getTime()) / 86_400_000) : null);

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

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const review = args.includes("--review");
  const toIdx = args.indexOf("--to");
  const testTo = toIdx >= 0 ? args[toIdx + 1]?.trim().toLowerCase() : null;
  if (toIdx >= 0 && !testTo) throw new Error("--to needs an address");
  // The dry run reports the mode --apply would run in; nothing is sent until --apply or --to.
  process.env.MAIL_LIVE = "1";
  const mode = mailMode();
  console.log(`mail: ${mode}${mode === "resend" ? " (key present; messages go out through Resend)" : ""}`);

  if (testTo) {
    if (mode !== "resend") throw new Error("no RESEND_API_KEY in .env.local; nothing sent");
    const r = await sendMail({ to: testTo, subject: WELCOME_SUBJECT, react: WelcomeEmail({ name: "", listingId: 1 }), kind: "welcome" });
    console.log(r.ok ? `sent test to ${testTo} (Resend id ${r.id})` : `failed: ${testTo}`);
    return;
  }

  const rows = await recipients();
  const done = await addressesIn(LOG, 1);
  const suppressed = await addressesIn(SUPPRESSED);
  const skip = await addressesIn(SKIP);
  const todo = rows.filter((r) => r.role !== "admin" && !done.has(r.email) && !suppressed.has(r.email) && !skip.has(r.email) && !isTestAddress(r.email));
  const left = rows.filter((r) => !todo.includes(r) && r.role !== "admin");

  if (review) {
    console.log("email\tfirst\tlisting\tstatus\tposted\tidle_days\tsemesters\tflag");
    for (const r of rows) {
      const idle = idleDays(r);
      const flag = !r.listingId ? "no listing" : /closed/.test(r.semesters ?? "") ? "closed semester" : idle !== null && idle > 365 ? "idle > 1 year" : "";
      console.log([r.email, r.firstName ?? "", r.listingId ?? "", r.status ?? "", r.posted ? new Date(r.posted).toISOString().slice(0, 10) : "", idle ?? "", r.semesters ?? "", flag].join("\t"));
    }
    return;
  }

  console.log(`${rows.length} migrated account(s): ${todo.length} to send, ${done.size} already mailed, ${suppressed.size} on the suppression file, ${skip.size} on the skip file, admins left out`);
  console.log("order: most recently active first");
  for (const r of todo) console.log(`  ${r.email}  idle ${idleDays(r) ?? "?"} d${r.listingId ? `  listing #${r.listingId} (${r.status})` : "  (no listing)"}`);
  if (left.length) console.log(`left out: ${left.map((r) => r.email).join(", ")}`);
  if (!apply) {
    console.log(`dry run; nothing sent. --apply would ${mode === "resend" ? "send via Resend" : `refuse: mail mode is ${mode}`}.`);
    return;
  }
  if (mode !== "resend") throw new Error(`mail mode is ${mode}; --apply needs RESEND_API_KEY in .env.local`);

  const adminKey = process.env.RESEND_ADMIN_API_KEY;
  if (!adminKey && !args.includes("--without-bounce-check")) {
    throw new Error("no RESEND_ADMIN_API_KEY in .env.local, so bounces cannot be watched; add one (full access) or pass --without-bounce-check");
  }

  await mkdir(path.dirname(LOG), { recursive: true, mode: 0o700 });
  const sentIds: { id: string; email: string }[] = [];
  const bounced = new Set<string>();
  const checkBounces = async () => {
    if (!adminKey) return;
    for (const s of sentIds) {
      if (bounced.has(s.id)) continue;
      const ev = await lastEvent(adminKey, s.id);
      if (ev === "bounced" || ev === "complained") bounced.add(s.id);
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
    const name = r.firstName?.trim() ?? "";
    const result = await sendMail({ to: r.email, subject: WELCOME_SUBJECT, react: WelcomeEmail({ name, listingId: r.listingId }), kind: "welcome", ref: r.listingId ?? undefined });
    if (result.ok) {
      sent++;
      if (result.id) sentIds.push({ id: result.id, email: r.email });
      await appendFile(LOG, `${new Date().toISOString()}\t${r.email}\t${r.listingId ?? ""}\t${result.id ?? ""}\n`, { mode: 0o600 });
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
