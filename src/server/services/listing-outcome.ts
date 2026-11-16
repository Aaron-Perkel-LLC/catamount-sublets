import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db, DbOrTx } from "@/db";
import { listings, listingSemesters, semesters, user } from "@/db/schema";
import { SITE } from "@/config/site";
import OutcomeAskEmail, { OUTCOME_ASK_SUBJECT } from "@/emails/outcome-ask";
import { formatAddress } from "@/lib/format";
import { posterFirstName } from "@/lib/person-name";
import { EMAIL_ANSWER_VALUES, type EmailAnswer, emailAnswerSchema, type Outcome } from "@/lib/listing-outcome";
import { askedCount, askRecipients, claimAsk, outcomeFor, recordOutcome, releaseAsk } from "@/server/data/listing-outcomes";
import { confirmListingAvailable, listingOwnerAndStatus, setListingStatus } from "@/server/data/my-listing";
import { assertWritable, ReadOnlyError } from "@/server/data/settings";
import { listingSnapshot, noticeStatus } from "@/server/email/notices";
import { sendMail } from "@/server/email/send";
import { log } from "@/server/log";
import { signOutcomeToken, verifyOutcomeToken } from "@/server/outcome-token";
import { RATE_LIMITS, takeRateLimit } from "@/server/rate-limit";
import { linkSecret } from "@/server/signed-link";

/**
 * The exit question, outside the delete flow (which records its answer in
 * deleteListingFor()): answers through the email's signed links (which act
 * on the listing, see answerFromLink), and the admin's per-semester send.
 */

/* ------------------------------------------------------------ the links */

export type OutcomePageState = { state: "invalid" } | { state: "open"; listingId: number; current: Outcome | null };

/** What /outcome shows for a token: the answer page, or "not valid". Reads only: the GET never writes; the page's POST does. */
export async function outcomePageState(db: DbOrTx, token: string): Promise<OutcomePageState> {
  const verified = verifyOutcomeToken(token);
  if (!verified) return { state: "invalid" };
  return { state: "open", listingId: verified.listingId, current: (await outcomeFor(db, verified.listingId))?.outcome ?? null };
}

/** What the answer did to the listing, for the page's message. */
export type ListingEffect = "taken" | "reopened" | "confirmed" | "unchanged" | "gone";
export type AnswerResult = { ok: true; outcome: EmailAnswer; effect: ListingEffect } | { ok: false; error: string };

const INVALID_LINK = "This link isn't valid any more. Reply to the email and it'll be sorted out by hand.";
const FILLED: readonly Outcome[] = ["through_site", "elsewhere"];

/**
 * An answer from the email, and what it does to the listing:
 *  - Filled (through us or elsewhere): the listing is marked taken, which
 *    the poster can undo from My post.
 *  - Still available: today is stamped as "confirmed available" on the
 *    listing. If an earlier email answer had marked it taken, it goes back
 *    up, so a mistaken tap is undone by the right one.
 *  - Taking it down: recorded only; the archive or the poster removes it.
 * The token is the whole authorisation and names one listing; every write
 * is scoped to that listing's owner. The listing may already be gone
 * (archived or deleted): the answer is still recorded, which is the point.
 */
export async function answerFromLink(db: Db, raw: { t: unknown; a: unknown }, ip: string): Promise<AnswerResult> {
  const parsed = emailAnswerSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: INVALID_LINK };
  const verified = verifyOutcomeToken(parsed.data.t);
  if (!verified) return { ok: false, error: INVALID_LINK };
  try {
    await assertWritable(db);
  } catch (error) {
    if (error instanceof ReadOnlyError) return { ok: false, error: error.message };
    throw error;
  }
  const quota = await takeRateLimit(db, RATE_LIMITS.outcomePerIp, ip);
  if (!quota.allowed) {
    log.warn("listing.outcome_rate_limited", { listingId: verified.listingId });
    return { ok: false, error: "That's a lot of answers in a short time. Try again in a little while." };
  }

  const { listingId } = verified;
  const answer = parsed.data.a;
  const { effect, replaced } = await db.transaction(async (tx) => {
    const previous = await outcomeFor(tx, listingId);
    const r = await recordOutcome(tx, { listingId, outcome: answer, source: "email" });
    const listing = await listingOwnerAndStatus(tx, listingId);
    if (!listing) return { effect: "gone" as const, replaced: r.replaced };
    const actor = { userId: listing.userId, isAdmin: false };
    let effect: ListingEffect = "unchanged";
    if (FILLED.includes(answer)) {
      if (await setListingStatus(tx, listingId, actor, "taken")) effect = "taken";
    } else if (answer === "still_available") {
      await confirmListingAvailable(tx, listingId, actor);
      effect = "confirmed";
      const emailMarkedTaken = previous?.source === "email" && FILLED.includes(previous.outcome);
      if (listing.status === "taken" && emailMarkedTaken && (await setListingStatus(tx, listingId, actor, "open"))) effect = "reopened";
    }
    return { effect, replaced: r.replaced };
  });

  if (effect === "taken" || effect === "reopened") {
    const snap = await listingSnapshot(db, listingId);
    if (snap) await noticeStatus(snap, effect === "taken" ? "taken" : "open", "poster");
  }
  log.info("listing.outcome", { listingId, outcome: answer, source: "email", replaced, effect });
  return { ok: true, outcome: answer, effect };
}

/* ------------------------------------------------------------- the send */

export interface AskPreview {
  code: string;
  name: string;
  blocking: string[];
  /** Who it would go to now: name for the admin's list, never shown elsewhere. */
  recipients: { listingId: number; name: string | null; email: string; place: string; status: string }[];
  /** Already sent for this semester. */
  alreadyAsked: number;
  /** Every listing, this semester's first, for "Send test to me". */
  testListings: { listingId: number; label: string }[];
}

export async function askPreview(db: Db, code: string): Promise<AskPreview> {
  const [sem] = await db.select().from(semesters).where(eq(semesters.code, code));
  if (!sem) return { code, name: code, blocking: ["No such semester."], recipients: [], alreadyAsked: 0, testListings: [] };
  const blocking: string[] = [];
  if (sem.archivedAt) blocking.push("Already archived: its listings are gone.");
  if (!linkSecret()) blocking.push("SURVEY_SECRET is not set on this deployment, so the answer links cannot be signed.");
  const recipients = sem.archivedAt ? [] : await askRecipients(db, code);
  return {
    code,
    name: sem.name,
    blocking,
    recipients: recipients.map((r) => ({ listingId: r.listingId, name: r.name, email: r.email, place: formatAddress(r.address), status: r.status })),
    alreadyAsked: await askedCount(db, code),
    testListings: await testListingChoices(db, code),
  };
}

async function testListingChoices(db: Db, code: string): Promise<{ listingId: number; label: string }[]> {
  const rows = await db
    .select({
      id: listings.id,
      address: listings.address,
      status: listings.status,
      inSemester: sql<boolean>`exists (select 1 from ${listingSemesters} ls where ls.listing_id = ${listings.id} and ls.semester_code = ${code})`,
    })
    .from(listings)
    .orderBy(desc(listings.id));
  return rows
    .sort((a, b) => Number(b.inSemester) - Number(a.inSemester))
    .map((r) => ({ listingId: r.id, label: `#${r.id} · ${formatAddress(r.address)}${r.status !== "open" ? ` · ${r.status}` : ""}${r.inSemester ? "" : " · other semester"}` }));
}

export function answerLinks(listingId: number, now = new Date()): Record<EmailAnswer, string> {
  const t = signOutcomeToken(listingId, now);
  return Object.fromEntries(EMAIL_ANSWER_VALUES.map((a) => [a, `${SITE.url}/outcome?t=${t}&a=${a}`])) as Record<EmailAnswer, string>;
}

export const OUTCOME_ASK_TEST_PREFIX = "[Test] ";

/**
 * "Send test to me": the email exactly as the listing's poster would get it,
 * with that listing's real signed links, sent only to the admin's own
 * address. Records no ask, so the real send still goes to the poster. The
 * links are live: tapping Filled in the test marks that listing taken.
 */
export async function sendAskTest(db: Db, admin: { id: string; email: string }, rawCode: unknown, rawListingId: unknown): Promise<{ ok: true; data: { to: string } } | { ok: false; error: string }> {
  const parsed = askTestInput.safeParse({ code: rawCode, listingId: rawListingId });
  if (!parsed.success) return { ok: false, error: "Pick a listing." };
  const { code, listingId } = parsed.data;
  if (!linkSecret()) return { ok: false, error: "SURVEY_SECRET is not set on this deployment, so the answer links cannot be signed." };
  const [sem] = await db.select({ name: semesters.name }).from(semesters).where(eq(semesters.code, code));
  if (!sem) return { ok: false, error: "No such semester." };
  const [l] = await db
    .select({ address: listings.address, displayName: listings.displayName, firstName: user.firstName, lastName: user.lastName, name: user.name, email: user.email, legacyNetid: user.legacyNetid })
    .from(listings)
    .innerJoin(user, eq(user.id, listings.userId))
    .where(eq(listings.id, listingId));
  if (!l) return { ok: false, error: "That listing is gone." };
  const quota = await takeRateLimit(db, RATE_LIMITS.adminMailPerUser, admin.id);
  if (!quota.allowed) return { ok: false, error: "That's a lot of email this hour. Try again later." };
  const name = posterFirstName({ ...l, legacyNames: [l.displayName, l.name] }) ?? "";
  const result = await sendMail({
    to: admin.email,
    subject: `${OUTCOME_ASK_TEST_PREFIX}${OUTCOME_ASK_SUBJECT}`,
    react: OutcomeAskEmail({ name, place: formatAddress(l.address), semesterName: sem.name, links: answerLinks(listingId) }),
    kind: "outcome_ask",
    ref: listingId,
  });
  log.info("listing.outcome_ask_test", { listingId, code, ok: result.ok });
  return result.ok ? { ok: true, data: { to: admin.email } } : { ok: false, error: result.error ?? "The test didn't send." };
}

const askTestInput = z.object({ code: z.string().min(1).max(40), listingId: z.number().int().positive().max(2_147_483_647) });

/**
 * Send the email to everyone askPreview() lists, one at a time. Each listing
 * is claimed before its send and released if the send fails, so a second
 * click sends nothing twice and a re-run after failures only retries those.
 */
export async function sendAsks(db: Db, code: string, confirm: string, options: { pauseMs?: number } = {}): Promise<{ ok: true; data: { sent: number; failed: number; skipped: number } } | { ok: false; error: string }> {
  if (confirm !== code) return { ok: false, error: "Type the semester code to confirm." };
  const preview = await askPreview(db, code);
  if (preview.blocking.length) return { ok: false, error: preview.blocking.join(" ") };
  const recipients = await askRecipients(db, code);
  if (recipients.length === 0) return { ok: false, error: "Nobody to ask: every listing has been asked or has answered." };
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  for (const [i, r] of recipients.entries()) {
    if (!(await claimAsk(db, code, r.listingId))) {
      skipped++;
      continue;
    }
    const result = await sendMail({
      to: r.email,
      subject: OUTCOME_ASK_SUBJECT,
      react: OutcomeAskEmail({ name: r.name ?? "", place: formatAddress(r.address), semesterName: preview.name, links: answerLinks(r.listingId) }),
      kind: "outcome_ask",
      ref: r.listingId,
      idempotencyKey: `outcome-ask:${code}:${r.listingId}`,
    });
    if (result.ok) sent++;
    else {
      failed++;
      await releaseAsk(db, code, r.listingId);
    }
    if (options.pauseMs && i < recipients.length - 1) await new Promise((res) => setTimeout(res, options.pauseMs));
  }
  log.info("listing.outcome_asks_sent", { code, sent, failed, skipped });
  return { ok: true, data: { sent, failed, skipped } };
}
