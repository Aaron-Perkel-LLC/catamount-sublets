import { createHash } from "node:crypto";
import { render } from "@react-email/components";
import { and, asc, eq, inArray } from "drizzle-orm";
import { SITE } from "@/config/site";
import type { Db, DbOrTx } from "@/db";
import { accessRequests, listingSemesters, listings, semesters, user } from "@/db/schema";
import AdminEmail, { adminEmailText, type GroupFooter } from "@/emails/admin-email";
import { appUrl } from "@/env";
import { audienceLabel, type EmailAudience, emailToSend, fieldErrors, isGroup, type LeftOutReason, NAME_PLACEHOLDER, SURVEY_PLACEHOLDER } from "@/lib/email";
import { posterFirstName } from "@/lib/person-name";
import { approveAccessRequest, dismissAccessRequest } from "@/server/data/access-requests";
import { claimDelivery, type EmailRow, finishIfDone, getEmail, listDeliveries, lockEmail, type NewDelivery, reached, recordTest, requeueFailed, requeueStale, RETRY_AFTER_MS, sendingEmailIds, settleDelivery, startSending } from "@/server/data/emails";
import { posterColumns } from "@/server/data/names";
import { surveyUnanswered } from "@/server/data/survey";
import { publicListingWhere } from "@/server/data/visibility";
import { digestMailingAddress, digestResendKey } from "@/server/digest-config";
import { signAnnounceUnsubscribe, verifyAnnounceUnsubscribe } from "@/server/email-token";
import { sendMail } from "@/server/email/send";
import { log } from "@/server/log";
import { RATE_LIMITS, takeRateLimit } from "@/server/rate-limit";
import { linkSecret } from "@/server/signed-link";
import { signSurveyToken } from "@/server/survey-token";

/**
 * Email the admin writes from the console, to one person or to a group.
 *
 * Write → check → send. The check renders the email for a named recipient
 * with the function that sends it. Send freezes the recipients into
 * email_deliveries in one transaction (the email can leave `draft` only
 * once) and returns; drain() then sends one message per recipient, each
 * under its own provider idempotency key, pausing between them. Whatever a
 * drain doesn't finish (a crashed function, a temporary failure waiting for
 * its next try) the hourly cron picks up through resumeSending().
 *
 * Nobody banned is ever mailed. Nobody marked Stop email is in a group
 * email; one written to them alone needs "send anyway", which is recorded.
 * Both are checked when the list is frozen and again as each one is sent.
 * A group email carries a one-click unsubscribe (which sets Stop email) and
 * the postal address, and goes from the bulk subdomain; an email to one
 * person carries neither and comes from the author's own address.
 */

export type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string; fieldErrors?: Record<string, string> };
const ok = <T>(data: T): Result<T> => ({ ok: true, data });
const fail = <T = undefined>(error: string, fields?: Record<string, string>): Result<T> => ({ ok: false, error, fieldErrors: fields });

export const MAX_ATTEMPTS = 3;
/** A recipient is `sending` for a second or two. One still `sending` after this long was dropped mid-send. */
export const STALE_SENDING_MS = 5 * 60_000;

/* ------------------------------------------------------------ who it goes to */

export interface Recipient {
  /** The account; null for an address that has none (a reply to a request). */
  userId: string | null;
  email: string;
  /** Their first name, or null: {name} then reads "there" (never their login). */
  name: string | null;
  posted: boolean;
  banned: boolean;
  stopEmail: boolean;
}
export type LeftOut = Recipient & { reason: LeftOutReason };

const PERSON = { id: user.id, email: user.email, ...posterColumns, banned: user.banned, noEmail: user.noEmail, displayName: listings.displayName, listingId: listings.id };

/**
 * The people an audience comes to right now, split into who will get it and
 * who is left out and why. One row per address. The survey group is the
 * survey's own definition of who is asked (src/server/data/survey.ts), which
 * already leaves out banned and Stop email accounts, so it reports nobody
 * left out. A kind it doesn't know (a retired group, in an old email's row)
 * comes to nobody, never to everyone.
 */
export async function resolveAudience(db: DbOrTx, audience: EmailAudience): Promise<{ to: Recipient[]; leftOut: LeftOut[] }> {
  let all: Recipient[];
  if (audience.kind === "survey") {
    all = (await surveyUnanswered(db)).map((r) => ({ userId: r.id, email: r.email, name: r.firstName, posted: r.posted, banned: false, stopEmail: false }));
  } else if (audience.kind === "address") {
    if (!audience.email) return { to: [], leftOut: [] };
    const rows = await db.select(PERSON).from(user).leftJoin(listings, eq(listings.userId, user.id)).where(eq(user.email, audience.email));
    all = rows.length > 0 ? rows.map(asRecipient) : [{ userId: null, email: audience.email, name: null, posted: false, banned: false, stopEmail: false }];
  } else if ((audience.kind === "people" && audience.userIds.length === 0) || !["semester", "board", "everyone", "people"].includes(audience.kind)) {
    all = [];
  } else {
    const rows =
      audience.kind === "semester"
        ? await db.select(PERSON).from(listingSemesters).innerJoin(listings, eq(listings.id, listingSemesters.listingId)).innerJoin(user, eq(user.id, listings.userId)).where(eq(listingSemesters.semesterCode, audience.code)).orderBy(asc(user.createdAt))
        : audience.kind === "board"
          ? await db.select(PERSON).from(listings).innerJoin(user, eq(user.id, listings.userId)).where(publicListingWhere()).orderBy(asc(user.createdAt))
          : await db
              .select(PERSON)
              .from(user)
              .leftJoin(listings, eq(listings.userId, user.id))
              .where(audience.kind === "people" ? inArray(user.id, audience.userIds) : undefined)
              .orderBy(asc(user.createdAt));
    all = rows.map(asRecipient);
  }
  const seen = new Set<string>();
  const to: Recipient[] = [];
  const leftOut: LeftOut[] = [];
  for (const r of all) {
    if (seen.has(r.email)) continue;
    seen.add(r.email);
    if (r.banned) leftOut.push({ ...r, reason: "banned" });
    else if (r.stopEmail) leftOut.push({ ...r, reason: "stop_email" });
    else to.push(r);
  }
  return { to, leftOut };
}

function asRecipient(r: { id: string; email: string; firstName: string | null; lastName: string | null; name: string; legacyNetid: string | null; banned: boolean | null; noEmail: boolean; displayName: string | null; listingId: number | null }): Recipient {
  return { userId: r.id, email: r.email, name: posterFirstName({ ...r, legacyNames: [r.displayName, r.name] }), posted: r.listingId !== null, banned: Boolean(r.banned), stopEmail: r.noEmail };
}

/* ------------------------------------------------------------ what each person gets */

type Content = Pick<EmailRow, "subject" | "body" | "audience" | "resolve">;
type To = Pick<Recipient, "userId" | "email" | "name" | "posted">;

/**
 * The body made out to one person. {survey} stays as typed where there is
 * no account or no secret to sign with; blockers() refuses to send that.
 * Links are signed as of `at`, so the same email to the same person comes
 * out the same however often it is put together.
 */
export function personalise(body: string, r: To, at: Date = new Date()): string {
  const named = body.replaceAll(NAME_PLACEHOLDER, r.name?.trim() || "there");
  return r.userId && linkSecret() ? named.replaceAll(SURVEY_PLACEHOLDER, `${SITE.url}/survey?t=${signSurveyToken(r.userId, at)}`) : named;
}

export interface Rendered {
  from: string;
  replyTo: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * One recipient's email, exactly: the check shows what this returns and
 * drain() sends what this returns. `unsubscribeAs` makes the unsubscribe
 * links someone else's (a test's are the admin's own, so pressing one in a
 * test can't unsubscribe the person it was written as).
 *
 * `at` is when its links are signed from. A send passes the moment the
 * email was sent (emails.sent_at), never the clock: a second try at one
 * recipient must be byte for byte the first, or the mail provider, seeing
 * the same idempotency key with different content, refuses it instead of
 * recognising it.
 */
function compose(e: Content, r: To, opts: { unsubscribeAs?: string | null; subjectPrefix?: string; at?: Date } = {}) {
  const group = isGroup(e.audience);
  const at = opts.at ?? new Date();
  const body = personalise(e.body, r, at);
  const who = opts.unsubscribeAs ?? r.userId;
  const token = group && who && linkSecret() ? signAnnounceUnsubscribe(who, at) : null;
  const footer: GroupFooter | null = group ? { unsubscribeUrl: `${appUrl()}/unsubscribe?t=${token ?? ""}`, mailingAddress: digestMailingAddress(), posted: r.posted } : null;
  return {
    group,
    subject: `${opts.subjectPrefix ?? ""}${e.subject.trim()}`,
    react: AdminEmail({ body, group: footer }),
    text: adminEmailText(body, footer),
    oneClickUnsubscribeUrl: token ? `${appUrl()}/api/email/unsubscribe?t=${token}` : undefined,
  };
}

async function rendered(e: Content, r: To, at?: Date): Promise<Rendered> {
  const m = compose(e, r, { at });
  return { from: m.group ? SITE.mailFromGroup : SITE.mailFromPersonal, replyTo: SITE.mailReplyTo, to: r.name ? `${r.name} <${r.email}>` : r.email, subject: m.subject, html: await render(m.react), text: m.text };
}

/** What stands in the way of sending this at all, in the admin's words. Empty when nothing does. */
export function blockers(e: Content, to: readonly To[]): string[] {
  const out: string[] = [];
  const survey = e.body.includes(SURVEY_PLACEHOLDER);
  if (isGroup(e.audience)) {
    if (!linkSecret()) out.push("SURVEY_SECRET is not set on this deployment, so the unsubscribe links can't be signed.");
    if (!digestMailingAddress()) out.push("MAILING_ADDRESS is not set on this deployment, and a group email needs it in its footer.");
  }
  if (e.audience.kind === "survey" && !survey) out.push(`Add ${SURVEY_PLACEHOLDER} where their survey link should go: this group is the people who haven't answered it.`);
  if (survey && !linkSecret()) out.push(`SURVEY_SECRET is not set on this deployment, so ${SURVEY_PLACEHOLDER} links can't be signed.`);
  if (survey && to.some((r) => !r.userId)) out.push(`${SURVEY_PLACEHOLDER} only works for someone with an account, and this address has none.`);
  return out;
}

/** Stands for the exact email that was looked at: Send must hand it back, and it only matches while nothing has changed. */
export function checkOf(e: Content): string {
  return createHash("sha256").update(JSON.stringify([e.subject, e.body, e.audience, e.resolve])).digest("hex").slice(0, 32);
}

export interface EmailCheck {
  check: string;
  group: boolean;
  /** Who will get it, in sending order (the first 500 for the list; `total` is all of them). */
  recipients: { name: string | null; email: string }[];
  total: number;
  leftOut: { name: string | null; email: string; reason: LeftOutReason }[];
  /** Which recipient `shown` is. */
  index: number;
  shown: Rendered | null;
  /** To one person only: they are marked Stop email (needs "send anyway") or banned (never sent). */
  warning: LeftOutReason | null;
  blockers: string[];
  /** What Send would refuse in the fields as they stand. */
  problems: Record<string, string>;
}

/** Everything the composer shows beside the writing: who gets it, who doesn't, and one recipient's email in full. */
export async function checkEmail(db: DbOrTx, id: number, index = 0): Promise<Result<EmailCheck>> {
  const e = await getEmail(db, id);
  if (!e) return fail("That email is gone.");
  const group = isGroup(e.audience);
  const { to, leftOut } = await resolveAudience(db, e.audience);
  // One person: their email is shown whoever they are; whether it may go is the warning.
  const list = group ? to : [...to, ...leftOut];
  const at = Math.min(Math.max(0, Math.trunc(index) || 0), Math.max(0, list.length - 1));
  const parsed = emailToSend.safeParse(e);
  const one = list[at];
  return ok({
    check: checkOf(e),
    group,
    recipients: list.slice(0, 500).map((r) => ({ name: r.name, email: r.email })),
    total: group ? to.length : to.length + leftOut.filter((r) => r.reason === "stop_email").length,
    leftOut: group ? leftOut.map((r) => ({ name: r.name, email: r.email, reason: r.reason })) : [],
    index: at,
    shown: one ? await rendered(e, one) : null,
    warning: group ? null : (leftOut[0]?.reason ?? null),
    blockers: blockers(e, list),
    problems: parsed.success ? {} : fieldErrors(parsed.error),
  });
}

/** One recipient's copy of an email that has gone, rebuilt from the email and what {name} was for them. */
export async function sentCopy(db: DbOrTx, emailId: number, deliveryId: number): Promise<Result<Rendered>> {
  const e = await getEmail(db, emailId);
  const d = (await listDeliveries(db, emailId)).find((x) => x.id === deliveryId);
  if (!e || !d || !d.address) return fail("That copy is gone.");
  return ok(await rendered(e, { userId: d.userId, email: d.address, name: d.greetedAs, posted: d.posted }, e.sentAt ?? undefined));
}

/* ------------------------------------------------------------ a test to the admin */

/**
 * Sends the email to the admin's own address, written as recipient number
 * `index` would get it, with "[Test]" on the subject. Its unsubscribe links
 * are the admin's own. Recorded as a test; never counted.
 */
export async function sendTest(db: DbOrTx, admin: { id: string; email: string }, id: number, index: number): Promise<Result<{ to: string; as: string }>> {
  const e = await getEmail(db, id);
  if (!e) return fail("That email is gone.");
  const parsed = emailToSend.safeParse(e);
  if (!parsed.success) return fail("Finish the email first.", fieldErrors(parsed.error));
  const { to, leftOut } = await resolveAudience(db, e.audience);
  const list = isGroup(e.audience) ? to : [...to, ...leftOut];
  const r = list[Math.min(Math.max(0, Math.trunc(index) || 0), list.length - 1)];
  if (!r) return fail("There is nobody to write it for yet.");
  const stop = blockers(e, list);
  if (stop.length > 0) return fail(stop[0]);
  const limit = await takeRateLimit(db, RATE_LIMITS.adminMailPerUser, admin.id);
  if (!limit.allowed) return fail(`That's ${RATE_LIMITS.adminMailPerUser.limit} emails this hour. Try again in ${Math.ceil(limit.retryAfterSeconds / 60)} min.`);
  const m = compose(e, r, { unsubscribeAs: admin.id, subjectPrefix: "[Test] " });
  const sent = await sendMail({ to: admin.email, subject: m.subject, react: m.react, text: m.text, kind: m.group ? "email_group" : "email_direct", ref: id, oneClickUnsubscribeUrl: m.oneClickUnsubscribeUrl, apiKey: m.group ? digestResendKey() : undefined });
  await recordTest(db, id, { address: admin.email, greetedAs: r.name, ok: sent.ok, providerId: sent.id ?? null, error: sent.ok ? null : (sent.error ?? "The send failed."), now: new Date() });
  log.info("email.test", { ref: id, ok: sent.ok });
  return sent.ok ? ok({ to: admin.email, as: r.name ?? r.email }) : fail(`Not sent: ${sent.error ?? "the send failed."}`);
}

/* ------------------------------------------------------------ send */

export interface SendInput {
  /** checkOf() of the email as it was last looked at. */
  check: string;
  /** A group: the number of recipients, typed. */
  typed: number | null;
  /** One person marked Stop email: send it anyway. */
  sendAnyway: boolean;
}
export interface SendStarted {
  /** True when it had already been sent: nothing new was queued. */
  already: boolean;
  queued: number;
  leftOut: number;
}

/**
 * Send, confirmed. In one transaction, under a lock on the email: it must
 * still be a draft, be the email that was looked at, and pass every rule;
 * then its recipients are written and it becomes `sending`. Nothing is sent
 * here; drain() does that.
 */
export async function startSend(db: Db, adminId: string, id: number, input: SendInput): Promise<Result<SendStarted>> {
  return db.transaction(async (tx): Promise<Result<SendStarted>> => {
    const e = await lockEmail(tx, id);
    if (!e) return fail("That email is gone.");
    if (e.status !== "draft") return ok({ already: true, queued: 0, leftOut: 0 });
    const parsed = emailToSend.safeParse(e);
    if (!parsed.success) return fail("Check the fields marked below.", fieldErrors(parsed.error));
    if (checkOf(e) !== input.check) return fail("This email changed after you last looked at it. Check it again, then send.");
    const group = isGroup(e.audience);
    const { to, leftOut } = await resolveAudience(tx, e.audience);
    const stop = blockers(e, group ? to : [...to, ...leftOut]);
    if (stop.length > 0) return fail(stop[0]);

    const deliveries: NewDelivery[] = [];
    if (group) {
      if (to.length === 0) return fail("Nobody in that group can be emailed.");
      if (input.typed !== to.length) return fail(`This would go to ${to.length} ${to.length === 1 ? "person" : "people"} now. Type ${to.length} to send.`);
      for (const r of to) deliveries.push({ userId: r.userId, address: r.email, greetedAs: r.name, posted: r.posted, status: "queued" });
      for (const r of leftOut) deliveries.push({ userId: r.userId, address: r.email, greetedAs: r.name, posted: r.posted, status: "left_out", reason: r.reason });
    } else {
      const r = to[0] ?? leftOut[0];
      if (!r) return fail("Enter one valid email address.");
      if (r.banned) return fail("That account is banned. Nothing is sent to a banned account.");
      if (r.stopEmail && !input.sendAnyway) return fail('That person is marked Stop email. Tick "Send anyway" to send this one.');
      if (e.accessRequestId) {
        const [req] = await tx.select({ id: accessRequests.id }).from(accessRequests).where(eq(accessRequests.id, e.accessRequestId));
        if (!req) return fail("That access request is gone.");
      }
      const limit = await takeRateLimit(tx, RATE_LIMITS.adminMailPerUser, adminId);
      if (!limit.allowed) return fail(`That's ${RATE_LIMITS.adminMailPerUser.limit} emails this hour. Try again in ${Math.ceil(limit.retryAfterSeconds / 60)} min.`);
      deliveries.push({ userId: r.userId, address: r.email, greetedAs: r.name, posted: r.posted, status: "queued", overridden: r.stopEmail });
    }
    const names = new Map((await tx.select({ code: semesters.code, name: semesters.name }).from(semesters)).map((s) => [s.code, s.name]));
    // Hand-picked people are named by how many it actually goes to, not how many were ticked.
    const toLabel = e.audience.kind === "people" ? `${to.length} hand-picked ${to.length === 1 ? "person" : "people"}` : audienceLabel(e.audience, names);
    await startSending(tx, id, { sender: group ? "group" : "personal", toLabel, deliveries, now: new Date() });
    log.info("email.send_started", { ref: id, queued: deliveries.filter((d) => d.status === "queued").length, leftOut: leftOut.length, group });
    return ok({ already: false, queued: deliveries.filter((d) => d.status === "queued").length, leftOut: deliveries.filter((d) => d.status === "left_out").length });
  });
}

/**
 * What a failed send means, from the provider's own name for it (or "threw"
 * when the request never got an answer) and, failing that, its words.
 * - not sent, worth another try: the rate limit or a quota;
 * - unknown: the provider or the network gave no clear answer, so it may
 *   have gone. Another try under the same key is safe, and is how we find out;
 * - already sent: the provider has this key with other content, so an
 *   earlier try was accepted;
 * - anything else is a refusal: the address, the sender, the key.
 */
const NOT_SENT = new Set(["rate_limit_exceeded", "daily_quota_exceeded", "monthly_quota_exceeded", "concurrent_idempotent_requests"]);
const UNKNOWN = new Set(["application_error", "internal_server_error", "threw"]);
const UNKNOWN_WORDS = /timeout|timed out|network|fetch|socket|ECONN|EAI_AGAIN|temporar|unavailable|internal server|bad gateway|\b5\d\d\b/i;
export const UNCONFIRMED = "Couldn't confirm it went";

function classify(r: { error?: string; code?: string }): "retry" | "unknown" | "already_sent" | "refused" {
  if (r.code === "invalid_idempotent_request") return "already_sent";
  if (r.code && NOT_SENT.has(r.code)) return "retry";
  if ((r.code && UNKNOWN.has(r.code)) || UNKNOWN_WORDS.test(r.error ?? "")) return "unknown";
  return "refused";
}

/**
 * Sends to an email's queued recipients, one message each, until none is
 * ready or the time is up. Safe to run twice at once (claimDelivery skips a
 * row another drain holds). A try that wasn't a clear refusal goes back to
 * the queue for a later drain, up to MAX_ATTEMPTS; a clear refusal is a
 * failure the admin sees at once. One recipient going wrong, even by an
 * exception, never stops the rest. When nobody is left waiting the email is
 * `sent`, and a reply that reached its one recipient settles the access
 * request it answers (decided from the rows, so it holds whichever drain
 * finishes it).
 */
export async function drain(db: Db, id: number, opts: { pauseMs?: number; budgetMs?: number; until?: number } = {}): Promise<{ sent: number; failed: number; finished: boolean }> {
  const e = await getEmail(db, id);
  if (!e || e.status !== "sending") return { sent: 0, failed: 0, finished: false };
  const until = opts.until ?? Date.now() + (opts.budgetMs ?? 600_000);
  const pauseMs = opts.pauseMs ?? 500;
  const group = isGroup(e.audience);
  let sent = 0;
  let failed = 0;
  while (Date.now() < until) {
    const d = await claimDelivery(db, id, new Date());
    if (!d) break;
    try {
      if (d.banned || (d.stopEmail && !d.overridden)) {
        await settleDelivery(db, d.id, { status: "left_out", reason: d.banned ? "banned" : "stop_email" });
        continue;
      }
      if (!d.address) {
        await settleDelivery(db, d.id, { status: "failed", reason: "Their account was deleted before it went." });
        failed++;
        continue;
      }
      const m = compose(e, { userId: d.userId, email: d.address, name: d.greetedAs, posted: d.posted }, { at: e.sentAt ?? e.createdAt });
      const r = await sendMail({ to: d.address, subject: m.subject, react: m.react, text: m.text, kind: group ? "email_group" : "email_direct", ref: `${id}.${d.id}`, idempotencyKey: `email/${id}/${d.id}`, oneClickUnsubscribeUrl: m.oneClickUnsubscribeUrl, apiKey: group ? digestResendKey() : undefined });
      const what = r.ok ? "sent" : classify(r);
      if (what === "sent" || what === "already_sent") {
        await settleDelivery(db, d.id, { status: "sent", providerId: r.id ?? null, now: new Date() });
        sent++;
      } else {
        const reason = r.error ?? "The send failed.";
        const again = what !== "refused" && d.attempts < MAX_ATTEMPTS;
        await settleDelivery(db, d.id, { status: again ? "queued" : "failed", reason: !again && what === "unknown" ? `${UNCONFIRMED}: ${reason}` : reason });
        if (!again) failed++;
      }
    } catch (error) {
      // Putting it together or recording it threw. Leave the row able to end: back in the queue while it has tries left, a failure after.
      log.error("email.delivery_threw", error, { ref: `${id}.${d.id}` });
      const again = d.attempts < MAX_ATTEMPTS;
      await settleDelivery(db, d.id, { status: again ? "queued" : "failed", reason: `${UNCONFIRMED}: something went wrong here while sending.` }).catch(() => {});
      if (!again) failed++;
    }
    if (pauseMs > 0) await new Promise((res) => setTimeout(res, pauseMs));
  }
  const finished = await finishIfDone(db, id, new Date());
  if (finished) {
    log.info("email.finished", { ref: id, sent, failed });
    if (!group && e.accessRequestId && e.resolve && (await reached(db, id))) {
      const done = e.resolve === "approve" ? Boolean(e.createdBy && (await approveAccessRequest(db, e.accessRequestId, e.createdBy))) : await dismissAccessRequest(db, e.accessRequestId);
      log.info("email.request_resolved", { ref: id, request: e.accessRequestId, resolve: e.resolve, done });
    }
  }
  return { sent, failed, finished };
}

/** "Retry failed": puts an email's failed recipients back in the queue. The caller drains. */
export async function retryFailed(db: DbOrTx, id: number): Promise<Result<{ queued: number }>> {
  const queued = await requeueFailed(db, id, UNCONFIRMED);
  if (queued === 0) return fail("Nothing here can be retried safely.");
  log.info("email.retry_failed", { ref: id, queued });
  return ok({ queued });
}

/**
 * The hourly cron's part: recipients dropped mid-send go back to the queue,
 * and every email still sending is drained, all within one budget so the
 * run ends before the platform ends it mid-send. Counts only.
 */
export async function resumeSending(db: Db, opts: { pauseMs?: number; budgetMs?: number; now?: Date } = {}): Promise<{ emails: number; requeued: number; sent: number; failed: number }> {
  const now = opts.now ?? new Date();
  const until = Date.now() + (opts.budgetMs ?? 240_000);
  const requeued = await requeueStale(db, new Date(now.getTime() - STALE_SENDING_MS));
  const ids = await sendingEmailIds(db);
  let sent = 0;
  let failed = 0;
  for (const id of ids) {
    if (Date.now() >= until) break;
    const r = await drain(db, id, { pauseMs: opts.pauseMs, until });
    sent += r.sent;
    failed += r.failed;
  }
  return { emails: ids.length, requeued, sent, failed };
}
export { RETRY_AFTER_MS };

/* ------------------------------------------------------------ unsubscribe */

export type UnsubscribeState = { state: "invalid" } | { state: "open"; already: boolean };

/** What the confirm page shows for a group email's unsubscribe link. Reads only. */
export async function announceUnsubscribeState(db: DbOrTx, token: unknown): Promise<UnsubscribeState> {
  const v = verifyAnnounceUnsubscribe(token);
  if (!v) return { state: "invalid" };
  const [u] = await db.select({ noEmail: user.noEmail }).from(user).where(eq(user.id, v.userId));
  return { state: "open", already: Boolean(u?.noEmail) };
}

/**
 * Marks the named account Stop email: the page's confirm button and the RFC
 * 8058 one-click POST both land here. Works while the site is read-only
 * (stopping mail must always work) and answers the same whether the account
 * still exists or was already stopped, so a token is not a way to learn
 * anything.
 */
export async function announceUnsubscribe(db: DbOrTx, token: unknown, via: "page" | "one_click"): Promise<{ ok: boolean }> {
  const v = verifyAnnounceUnsubscribe(token);
  if (!v) return { ok: false };
  await db.update(user).set({ noEmail: true, noEmailAt: new Date(), noEmailSource: "unsubscribe" }).where(and(eq(user.id, v.userId), eq(user.noEmail, false)));
  log.info("email.unsubscribe", { via });
  return { ok: true };
}
