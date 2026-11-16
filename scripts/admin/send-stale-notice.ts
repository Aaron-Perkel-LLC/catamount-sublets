/**
 * The stale-listing notice to migrated posters who have never signed in here
 * and still have a listing (src/server/data/stale.ts staleAudience: banned,
 * admins, test addresses left out; Stop-email accounts reported apart and
 * never mailed). Dry run by default. --apply sends, one message a second, and
 * appends `time, address, user id, Resend id` to STALE_NOTICE_LOG (default
 * ~/sublet-migration/stale-notice.log) so a re-run skips everyone already
 * mailed. remove-stale.ts reads that log to know who was told.
 *
 *   npm run send-stale-notice -- --deadline 2026-11-20                    # dry run
 *   npm run send-stale-notice -- --deadline 2026-11-20 --review           # TSV
 *   npm run send-stale-notice -- --deadline 2026-11-20 --to me@x.edu      # that account's real message, to it; not logged
 *   npm run send-stale-notice -- --deadline 2026-11-20 --apply            # send
 *   npm run send-stale-notice -- --deadline 2026-11-20 --reminder         # reminder dry run
 *   npm run send-stale-notice -- --deadline 2026-11-20 --reminder --apply # send the reminder
 *
 * --reminder recomputes the audience (anyone who has signed in since drops
 * out), takes only people in the first notice's log, prefixes the subject
 * with "Reminder: " and logs to STALE_REMINDER_LOG
 * (default ~/sublet-migration/stale-notice-reminder.log).
 *
 * The deadline is an Eastern calendar date; the mail says 11:59 pm that day.
 * Sending refuses once the deadline has passed. Sender, Reply-To and
 * List-Unsubscribe are the welcome mail's. No links but the front page, no
 * new secret. Skips ~/sublet-migration/suppressed.txt and skip.txt; --apply
 * refuses when suppressed.txt is missing (rebuild it from Resend first).
 * Bounce stop as in send-survey (RESEND_ADMIN_API_KEY, or
 * --without-bounce-check).
 *
 * Sending is external and visible to real people: run --to and --apply only
 * on an explicit go-ahead. A production run exports production's DATABASE_URL.
 */
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { getDb } from "../../src/db";
import { listings, user } from "../../src/db/schema";
import StaleNoticeEmail, { staleNoticeSubject } from "../../src/emails/stale-notice";
import { assertIsoDate, deadlineWords, easternDayStart, easternDeadlinePassed, nextDate } from "../../src/lib/dates";
import { posterFirstName } from "../../src/lib/person-name";
import { type StaleRow, staleAudience, streetOf } from "../../src/server/data/stale";
import { mailMode, sendMail } from "../../src/server/email/send";
import { NOTICE_LOG, REMINDER_LOG, SKIP, SUPPRESSED, argAfter, columnIn, exists } from "./stale-files";

const MAX_BOUNCES = 2;
const PACE_MS = 1000;

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

/** Any account by address, for --to; its own listing's street, or a sample street when it has none. */
async function accountFor(email: string): Promise<StaleRow | null> {
  const db = await getDb();
  const [r] = await db
    .select({ id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, name: user.name, legacyNetid: user.legacyNetid, displayName: listings.displayName, listingId: listings.id, address: listings.address, status: listings.status })
    .from(user)
    .leftJoin(listings, eq(listings.userId, user.id))
    .where(eq(user.email, email));
  if (!r) return null;
  return { id: r.id, email: r.email, firstName: posterFirstName({ ...r, legacyNames: [r.displayName, r.name] }), listingId: r.listingId ?? 0, street: r.address ? streetOf(r.address) : "12 Sample St", semester: null, status: r.status ?? "" };
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const review = args.includes("--review");
  const reminder = args.includes("--reminder");
  const testTo = argAfter(args, "--to")?.toLowerCase() ?? null;
  const deadlineArg = argAfter(args, "--deadline");
  if (!deadlineArg) throw new Error("--deadline YYYY-MM-DD is required (an Eastern calendar date; listings go after 11:59 pm that day)");
  const deadline = assertIsoDate(deadlineArg);
  const subject = staleNoticeSubject(deadline, reminder);
  const mailFor = (r: StaleRow) => StaleNoticeEmail({ name: r.firstName ?? "", street: r.street, email: r.email, deadline });

  // The dry run reports the mode --apply would run in; nothing is sent until --apply or --to.
  process.env.MAIL_LIVE = "1";
  const mode = mailMode();
  console.log(`mail: ${mode}${mode === "resend" ? " (key present; messages go out through Resend)" : ""}`);
  console.log(`deadline: 11:59 pm Eastern on ${deadlineWords(deadline).long} (passes at ${easternDayStart(nextDate(deadline)).toISOString()})`);
  console.log(`subject: ${subject}`);
  if (easternDeadlinePassed(deadline) && (apply || testTo)) throw new Error("the deadline has passed; a notice now would be wrong. Nothing sent.");

  if (testTo) {
    if (mode !== "resend") throw new Error("no RESEND_API_KEY; nothing sent");
    const r = await accountFor(testTo);
    if (!r) throw new Error(`${testTo} has no account here`);
    const result = await sendMail({ to: r.email, subject, react: mailFor(r), kind: "stale_notice", ref: r.id });
    console.log(result.ok ? `sent test to ${r.email} (Resend id ${result.id}); not logged` : `failed: ${r.email}`);
    return;
  }

  const { mail, noEmail } = await staleAudience(await getDb());
  const log = reminder ? REMINDER_LOG : NOTICE_LOG;
  const done = await columnIn(log, 2);
  const noticed = await columnIn(NOTICE_LOG, 2);
  const suppressed = await columnIn(SUPPRESSED);
  const skip = await columnIn(SKIP);
  const todo = mail.filter((r) => !done.has(r.id) && !suppressed.has(r.email) && !skip.has(r.email) && (!reminder || noticed.has(r.id)));

  if (review) {
    console.log("email\tfirst\tlisting\tstatus\tsemester\tstreet\tgroup\tstate");
    for (const r of [...mail, ...noEmail]) {
      const state = noEmail.includes(r) ? "no_email: not mailed" : skip.has(r.email) ? "skip.txt" : suppressed.has(r.email) ? "suppressed" : done.has(r.id) ? "already mailed" : reminder && !noticed.has(r.id) ? "no first notice" : "to send";
      console.log([r.email, r.firstName ?? "", r.listingId, r.status, r.semester ?? "", r.street, noEmail.includes(r) ? "no_email" : "mail", state].join("\t"));
    }
    return;
  }

  const bySemester = new Map<string, number>();
  for (const r of [...mail, ...noEmail]) bySemester.set(r.semester ?? "(none)", (bySemester.get(r.semester ?? "(none)") ?? 0) + 1);
  console.log(`${reminder ? "reminder" : "notice"}: ${mail.length + noEmail.length} account(s) in the audience (${[...bySemester].map(([k, v]) => `${k} ${v}`).join(", ")})`);
  console.log(`  ${todo.length} to send; ${mail.filter((r) => done.has(r.id)).length} already mailed; ${mail.filter((r) => suppressed.has(r.email)).length} suppressed; ${mail.filter((r) => skip.has(r.email)).length} on skip.txt${reminder ? `; ${mail.filter((r) => !noticed.has(r.id)).length} without a first notice` : ""}`);
  console.log(`  ${noEmail.length} asked for no email: not mailed, yours to decide`);
  for (const r of todo) console.log(`  ${r.email}  listing #${r.listingId} (${r.status}, ${r.semester ?? "no semester"})`);
  if (!apply) {
    console.log(`dry run; nothing sent. --apply would ${mode === "resend" ? "send via Resend" : `refuse: mail mode is ${mode}`}.`);
    return;
  }
  if (mode !== "resend") throw new Error(`mail mode is ${mode}; --apply needs RESEND_API_KEY`);
  if (!(await exists(SUPPRESSED))) throw new Error(`${SUPPRESSED} is missing; rebuild it from Resend's suppression list before sending. Nothing sent.`);
  const adminKey = process.env.RESEND_ADMIN_API_KEY;
  if (!adminKey && !args.includes("--without-bounce-check")) {
    throw new Error("no RESEND_ADMIN_API_KEY, so bounces cannot be watched; add one (full access) or pass --without-bounce-check");
  }

  await mkdir(path.dirname(log), { recursive: true, mode: 0o700 });
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
    if (easternDeadlinePassed(deadline)) {
      console.log(`STOP: the deadline passed mid-run. ${sent} sent, ${todo.length - i} not sent.`);
      break;
    }
    const result = await sendMail({ to: r.email, subject, react: mailFor(r), kind: "stale_notice", ref: r.id });
    if (result.ok) {
      sent++;
      if (result.id) sentIds.push(result.id);
      await appendFile(log, `${new Date().toISOString()}\t${r.email}\t${r.id}\t${result.id ?? ""}\n`, { mode: 0o600 });
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
  console.log(`sent ${sent}, failed ${failed}, bounced so far ${bounced.size}${adminKey ? "" : " (not watched)"}; log: ${log}`);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
