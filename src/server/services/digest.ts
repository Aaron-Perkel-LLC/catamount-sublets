import "server-only";
import { render } from "@react-email/components";
import { eq } from "drizzle-orm";
import type { Db, DbOrTx } from "@/db";
import { semesters, user } from "@/db/schema";
import { DIGEST } from "@/config/site";
import DigestEmail, { type DigestEmailProps, type DigestListingLine, digestSubject, digestText } from "@/emails/digest";
import { appUrl } from "@/env";
import { easternClock } from "@/lib/dates";
import { deleteSearchInput, digestToggleInput, renameSearchInput, saveSearchInput } from "@/lib/digest";
import { canonicalFilterQuery, describeFilters, parseSavedQuery } from "@/lib/listing-filters";
import { shareCardLines } from "@/lib/share";
import {
  claimDigestSend,
  type DigestCandidate,
  digestCandidates,
  digestSendFor,
  digestSubscriptionFor,
  digestTotals,
  digestWeekCounts,
  deleteSavedSearch,
  insertSavedSearch,
  lastDigestWeek,
  renameSavedSearch,
  retakeStaleDigestSend,
  savedSearchesFor,
  setDigestEnabled,
  settleDigestSend,
} from "@/server/data/digest";
import { type ListingDto, newBoardListings } from "@/server/data/listings";
import { assertWritable, getSetting, ReadOnlyError, setSetting } from "@/server/data/settings";
import { digestMailingAddress, digestResendKey } from "@/server/digest-config";
import { signDigestUnsubscribe, verifyDigestUnsubscribe } from "@/server/digest-token";
import { consoleMode, isTestAddress, mailMode, sendMail } from "@/server/email/send";
import { log } from "@/server/log";
import { RATE_LIMITS, takeRateLimit } from "@/server/rate-limit";
import { linkSecret } from "@/server/signed-link";

/**
 * Saved searches and the weekly digest.
 *
 * The digest goes once a week (DIGEST.weekday at DIGEST.hour Eastern) to
 * everyone who turned it on, listing what was posted since their last one
 * that matches any of their saved searches, through the very query Browse
 * runs (newBoardListings). Nothing is sent when nothing matches.
 *
 * Idempotency: before anything is sent, the person's row for the week is
 * claimed in digest_sends (unique per person and week). A doubled or
 * retried cron finds the row and moves on. The send carries a Resend
 * Idempotency-Key of `digest/<user id>/<week>`.
 *
 * A failure after the claim:
 *  - Resend refuses the message: the row is settled `failed` and is not
 *    tried again that week. The next week's window starts where the last
 *    sent or empty one ended (DIGEST.maxWindowDays at most), so what it
 *    would have held comes in the next digest instead.
 *  - The run dies between the claim and the settle (timeout, crash): the
 *    row stays `pending`. A catch-up run (the hours after DIGEST.hour) at
 *    least STALE_PENDING_MS later takes it over and sends again under the
 *    same Idempotency-Key, which Resend honours for 24 hours: if the first
 *    attempt did reach Resend, the second is not delivered again. A row
 *    still pending a day later is failed by the daily sweep.
 */

/** How long a claimed row must sit pending before a catch-up run may take it over. */
export const STALE_PENDING_MS = 10 * 60_000;
/** Stop claiming new people this long into a run, leaving room under the function's 300 s for the last send. */
export const RUN_BUDGET_MS = 240_000;
/**
 * Pause between sends. Resend's per-second limit is shared by the whole
 * account, sign-in codes included; one a second leaves room for codes.
 */
export const SEND_PAUSE_MS = 1000;

/* ---------------------------------------------------------- the clock */

export type DigestClock = { act: true; week: string; catchUp: boolean } | { act: false; reason: "not_the_day" | "before_the_hour" | "after_catch_up" };

/**
 * Whether the hourly cron should act at `now`: on the digest weekday,
 * Eastern, from DIGEST.hour through DIGEST.catchUpHours more. `week` (the
 * Eastern date of that day) is the idempotency key's week. Eastern via
 * src/lib/dates.ts, so it is right on both sides of a DST change.
 */
export function digestClock(now: Date): DigestClock {
  const c = easternClock(now);
  if (c.weekday !== DIGEST.weekday) return { act: false, reason: "not_the_day" };
  if (c.hour < DIGEST.hour) return { act: false, reason: "before_the_hour" };
  if (c.hour > DIGEST.hour + DIGEST.catchUpHours) return { act: false, reason: "after_catch_up" };
  return { act: true, week: c.date, catchUp: c.hour > DIGEST.hour };
}

/** The Eastern date of the next digest morning on or after `now` (today if it is the day), for the admin. */
export function nextDigestDate(now: Date): string {
  for (let d = 0; d < 8; d++) {
    const c = easternClock(new Date(now.getTime() + d * 86_400_000));
    if (c.weekday === DIGEST.weekday && (d > 0 || c.hour <= DIGEST.hour + DIGEST.catchUpHours)) return c.date;
  }
  return easternClock(now).date;
}

/**
 * What the digest covers: listings posted after `since` up to `until`
 * (now). The first one after opting in: since the opt-in, at most
 * DIGEST.firstWindowDays back. After that: since the end of the last sent
 * or empty digest (a failed one doesn't count, so its listings come next
 * time), at most DIGEST.maxWindowDays back; and never before the latest
 * opt-in, so turning it off and on again starts afresh.
 */
export function digestWindow(now: Date, c: { enabledAt: Date | null; lastWindowEnd: Date | null }): { since: Date; until: Date } {
  const capDays = c.lastWindowEnd ? DIGEST.maxWindowDays : DIGEST.firstWindowDays;
  const floor = now.getTime() - capDays * 86_400_000;
  const since = Math.min(now.getTime(), Math.max(floor, c.enabledAt?.getTime() ?? floor, c.lastWindowEnd?.getTime() ?? floor));
  return { since: new Date(since), until: now };
}

/* ------------------------------------------------------- who gets one */

export type SkipReason = "banned" | "stop_email" | "test_address" | "no_searches";

/** Why a person with the digest on gets none, or null when they are in. */
export function skipReason(c: DigestCandidate): SkipReason | null {
  if (c.banned) return "banned";
  if (c.noEmail) return "stop_email";
  if (isTestAddress(c.email)) return "test_address";
  if (c.searches.length === 0) return "no_searches";
  return null;
}

/**
 * The full send goes only from Production. A preview (which may point at the
 * production database, switch included) or a laptop with a live key gets
 * "not_production" instead; only console and test mode, which send nothing,
 * run it elsewhere. "Send a test to me" is not affected: it mails the
 * signed-in admin and no one else.
 */
export function fullSendAllowedHere(): boolean {
  return process.env.VERCEL_ENV === "production" || consoleMode();
}

/** Why the digest cannot run at all here: shown on the admin switch, and the cron refuses while any hold. */
export function digestBlockers(): string[] {
  const out: string[] = [];
  if (!digestMailingAddress()) out.push("MAILING_ADDRESS is not set on this deployment (bulk mail needs a postal address in its footer).");
  if (!linkSecret()) out.push("SURVEY_SECRET is not set on this deployment, so unsubscribe links can't be signed.");
  if (mailMode() === "unconfigured") out.push("RESEND_API_KEY is not set on this deployment.");
  if (mailMode() === "resend" && !digestResendKey()) out.push("RESEND_DIGEST_API_KEY (the sending key scoped to the digest's subdomain) is not set on this deployment.");
  if (process.env.VERCEL && !process.env.CRON_SECRET) out.push("CRON_SECRET is not set on this deployment, so the cron can't call the digest.");
  return out;
}

/* ------------------------------------------------------ what's in one */

export interface BuiltDigest {
  /** New matching listings, each once however many searches it matched. */
  total: number;
  lines: DigestListingLine[];
  firstThumb: string | null;
  searches: number;
}

/**
 * The digest's contents for one person over a window: each saved search run
 * through Browse's query (newBoardListings: same filters, same visibility,
 * narrowed to the window and to other people's listings), merged, newest
 * first. A listing carries only its share-card lines and its share link.
 */
export async function buildDigest(db: DbOrTx, c: { userId: string; searches: { name: string; query: string }[] }, window: { since: Date; until: Date }): Promise<BuiltDigest> {
  const merged = new Map<number, { dto: ListingDto; matched: string[] }>();
  for (const s of c.searches) {
    const found = await newBoardListings(db, parseSavedQuery(s.query), { recipientId: c.userId, ...window });
    for (const dto of found) {
      const m = merged.get(dto.id);
      if (m) m.matched.push(s.name);
      else merged.set(dto.id, { dto, matched: [s.name] });
    }
  }
  const all = [...merged.values()].sort((a, b) => b.dto.postedAt.localeCompare(a.dto.postedAt) || b.dto.id - a.dto.id);
  const lines = all.slice(0, DIGEST.maxListingsShown).map(({ dto, matched }) => {
    const card = shareCardLines(dto);
    return { id: dto.id, price: card.price, negotiable: card.negotiable, semester: card.semester, facts: card.facts, url: dto.shareUrl, matched };
  });
  const firstThumb = DIGEST.firstListingThumbnail ? (all[0]?.dto.photos[0]?.thumb ?? null) : null;
  return { total: all.length, lines, firstThumb, searches: c.searches.length };
}

function unsubscribeLinks(userId: string): { page: string; oneClick: string } {
  const t = encodeURIComponent(signDigestUnsubscribe(userId));
  return { page: `${appUrl()}/unsubscribe?t=${t}`, oneClick: `${appUrl()}/api/digest/unsubscribe?t=${t}` };
}

/** The email's props. `unsubscribeFor` is whose digest the links turn off: the recipient's own, always. */
function emailProps(built: BuiltDigest, unsubscribeFor: string): { props: DigestEmailProps; oneClick: string } {
  const links = unsubscribeLinks(unsubscribeFor);
  return {
    props: {
      total: built.total,
      listings: built.lines,
      severalSearches: built.searches > 1,
      firstThumb: built.firstThumb,
      browseUrl: `${appUrl()}/browse`,
      accountUrl: `${appUrl()}/account#alerts`,
      unsubscribeUrl: links.page,
      mailingAddress: digestMailingAddress(),
    },
    oneClick: links.oneClick,
  };
}

/* ---------------------------------------------------------- the run */

export interface DigestRunSummary {
  acted: boolean;
  /** Why it did nothing, when it did nothing. */
  reason?: string;
  week?: string;
  sent: number;
  empty: number;
  failed: number;
  /** Already handled this week (any status), or pending under another run. */
  done: number;
  /** Stuck pending rows this run took over and sent again. */
  retaken: number;
  /** Left for the next catch-up run: the time budget ran out. */
  deferred: number;
  skipped: Record<SkipReason, number>;
}

const zeroSkips = (): Record<SkipReason, number> => ({ banned: 0, stop_email: 0, test_address: 0, no_searches: 0 });
const idle = (reason: string): DigestRunSummary => ({ acted: false, reason, sent: 0, empty: 0, failed: 0, done: 0, retaken: 0, deferred: 0, skipped: zeroSkips() });

export interface RunOptions {
  budgetMs?: number;
  pauseMs?: number;
  /** Milliseconds since the run started; tests replace it. */
  elapsed?: () => number;
}

/**
 * One cron firing. Does nothing unless this is Production, the admin switch is on, nothing
 * blocks it, the site is writable and it is the digest's hour (or a
 * catch-up hour after it). Each person: claim, build, send or record empty,
 * settle. See the top of this file for what a failure leaves.
 */
export async function runDigest(db: Db, now = new Date(), opts: RunOptions = {}): Promise<DigestRunSummary> {
  if (!fullSendAllowedHere()) {
    log.warn("digest.not_production", { vercelEnv: process.env.VERCEL_ENV ?? "none" });
    return idle("not_production");
  }
  if (!(await getSetting(db, "digest")).enabled) return idle("switched_off");
  const clock = digestClock(now);
  if (!clock.act) return idle(clock.reason);
  const blockers = digestBlockers();
  if (blockers.length) {
    // Env var names only, no addresses (hard rule 3).
    log.warn("digest.blocked", { week: clock.week, blockers: blockers.join(" | ") });
    return idle("blocked");
  }
  if ((await getSetting(db, "read_only")).active) return idle("read_only");

  const started = Date.now();
  const elapsed = opts.elapsed ?? (() => Date.now() - started);
  const budget = opts.budgetMs ?? RUN_BUDGET_MS;
  const pause = opts.pauseMs ?? SEND_PAUSE_MS;
  const { week } = clock;
  const out: DigestRunSummary = { ...idle(""), acted: true, reason: undefined, week };

  for (const c of await digestCandidates(db)) {
    const skip = skipReason(c);
    if (skip) {
      out.skipped[skip]++;
      continue;
    }
    if (elapsed() > budget) {
      out.deferred++;
      continue;
    }

    let row = await digestSendFor(db, c.userId, week);
    if (row) {
      const stale = row.status === "pending" && row.attemptedAt.getTime() < Date.now() - STALE_PENDING_MS;
      if (!stale || !(await retakeStaleDigestSend(db, row.id, new Date(Date.now() - STALE_PENDING_MS)))) {
        out.done++;
        continue;
      }
      out.retaken++;
      log.info("digest.retake", { ref: row.id });
    } else {
      const window = digestWindow(now, c);
      row = await claimDigestSend(db, { userId: c.userId, week, windowStart: window.since, windowEnd: window.until });
      if (!row) {
        out.done++;
        continue;
      }
    }

    const built = await buildDigest(db, c, { since: row.windowStart, until: row.windowEnd });
    if (built.total === 0) {
      await settleDigestSend(db, row.id, { status: "empty", searches: built.searches });
      out.empty++;
      continue;
    }
    const { props, oneClick } = emailProps(built, c.userId);
    const result = await sendMail({
      to: c.email,
      subject: digestSubject(built.total, props.severalSearches),
      react: DigestEmail(props),
      text: digestText(props),
      kind: "digest",
      ref: row.id,
      idempotencyKey: `digest/${c.userId}/${week}`,
      oneClickUnsubscribeUrl: oneClick,
      apiKey: digestResendKey(),
    });
    if (result.ok) {
      await settleDigestSend(db, row.id, { status: "sent", searches: built.searches, matches: built.total, resendId: result.id ?? null });
      out.sent++;
    } else {
      await settleDigestSend(db, row.id, { status: "failed", searches: built.searches, matches: built.total, error: result.error ?? "The send failed." });
      out.failed++;
    }
    if (pause > 0) await new Promise((r) => setTimeout(r, pause));
  }

  log.info("digest.run", { week, catchUp: clock.catchUp, sent: out.sent, empty: out.empty, failed: out.failed, done: out.done, retaken: out.retaken, deferred: out.deferred, ...prefixed(out.skipped) });
  return out;
}

const prefixed = (s: Record<SkipReason, number>) => Object.fromEntries(Object.entries(s).map(([k, v]) => [`skip_${k}`, v]));

/* ------------------------------------------------------ the admin view */

export type PreviewState = "would_send" | "no_matches" | "sent" | "empty" | "failed" | "pending";

export interface DigestPreviewRow {
  userId: string;
  /** The first eight characters of the account id: enough to tell rows apart, not an address. */
  ref: string;
  searches: number;
  matches: number;
  state: PreviewState;
}

export interface DigestOverview {
  switchOn: boolean;
  blockers: string[];
  /** The Eastern date the next (or today's) digest runs, and its hour. */
  nextDate: string;
  hour: number;
  totals: { subscribed: number; searches: number };
  week: { date: string; counts: Record<"pending" | "sent" | "empty" | "failed", number> } | null;
  skipped: Record<SkipReason, number>;
  rows: DigestPreviewRow[];
}

/**
 * Who would get a digest if it ran now and how many listings it would hold:
 * counts, never addresses. A person already handled for the coming digest's
 * week shows that instead. Reads only.
 */
export async function digestOverview(db: Db, now = new Date()): Promise<DigestOverview> {
  const week = nextDigestDate(now);
  const [settings, totals, lastWeek] = await Promise.all([getSetting(db, "digest"), digestTotals(db), lastDigestWeek(db)]);
  const skipped = zeroSkips();
  const rows: DigestPreviewRow[] = [];
  for (const c of await digestCandidates(db)) {
    const skip = skipReason(c);
    if (skip) {
      skipped[skip]++;
      continue;
    }
    const existing = await digestSendFor(db, c.userId, week);
    const window = existing ? { since: existing.windowStart, until: existing.windowEnd } : digestWindow(now, c);
    const built = await buildDigest(db, c, window);
    const state: PreviewState = existing ? existing.status : built.total > 0 ? "would_send" : "no_matches";
    rows.push({ userId: c.userId, ref: c.userId.slice(0, 8), searches: built.searches, matches: built.total, state });
  }
  rows.sort((a, b) => b.matches - a.matches || a.ref.localeCompare(b.ref));
  return {
    switchOn: settings.enabled,
    blockers: digestBlockers(),
    nextDate: week,
    hour: DIGEST.hour,
    totals,
    week: lastWeek ? { date: lastWeek, counts: await digestWeekCounts(db, lastWeek) } : null,
    skipped,
    rows,
  };
}

export interface DigestRender {
  subject: string;
  html: string;
  text: string;
  total: number;
  /** True when nothing is new for them, so the render shows their newest matches from any time instead. */
  fallback: boolean;
}

/**
 * One person's digest as it would go now (the full render behind a row of
 * the admin's list). Unsubscribe links in it are `unsubscribeFor`'s own,
 * so a test sent to the admin can only ever turn off the admin's digest.
 * With nothing new, it falls back to their newest matches from any time,
 * so there is something to look at.
 */
export async function renderDigestFor(db: Db, userId: string, unsubscribeFor: string, now = new Date()): Promise<DigestRender | null> {
  const searches = await savedSearchesFor(db, userId);
  if (searches.length === 0) return null;
  const sub = await digestSubscriptionFor(db, userId);
  const c = (await digestCandidates(db)).find((x) => x.userId === userId);
  const window = digestWindow(now, { enabledAt: sub.enabledAt, lastWindowEnd: c?.lastWindowEnd ?? null });
  let built = await buildDigest(db, { userId, searches }, window);
  let fallback = false;
  if (built.total === 0) {
    built = await buildDigest(db, { userId, searches }, { since: new Date(0), until: now });
    fallback = true;
  }
  if (built.total === 0) return { subject: digestSubject(0, searches.length > 1), html: "", text: "", total: 0, fallback };
  const { props } = emailProps(built, unsubscribeFor);
  return { subject: digestSubject(built.total, props.severalSearches), html: await render(DigestEmail(props)), text: digestText(props), total: built.total, fallback };
}

export const DIGEST_TEST_PREFIX = "[Test] ";

/**
 * "Send a test to me": the chosen person's digest as it would go now (or
 * their newest matches, if nothing is new), sent only to the admin's own
 * address, from the digest's sender, with the admin's own unsubscribe
 * links. Records no digest_sends row and ignores the switch, so it works
 * before the digest is turned on. Counts against the admin's hourly mail limit.
 */
export async function sendDigestTest(db: Db, admin: { id: string; email: string }, rawUserId: unknown): Promise<{ ok: true; data: { to: string; total: number; fallback: boolean } } | { ok: false; error: string }> {
  if (typeof rawUserId !== "string" || !/^[0-9a-f-]{36}$/.test(rawUserId)) return { ok: false, error: "Pick a person." };
  if (!linkSecret()) return { ok: false, error: "SURVEY_SECRET is not set on this deployment, so the unsubscribe links can't be signed." };
  const searches = await savedSearchesFor(db, rawUserId);
  if (searches.length === 0) return { ok: false, error: "They have no saved searches." };
  const sub = await digestSubscriptionFor(db, rawUserId);
  const c = (await digestCandidates(db)).find((x) => x.userId === rawUserId);
  const now = new Date();
  let built = await buildDigest(db, { userId: rawUserId, searches }, digestWindow(now, { enabledAt: sub.enabledAt, lastWindowEnd: c?.lastWindowEnd ?? null }));
  let fallback = false;
  if (built.total === 0) {
    built = await buildDigest(db, { userId: rawUserId, searches }, { since: new Date(0), until: now });
    fallback = true;
  }
  if (built.total === 0) return { ok: false, error: "Nothing on the board matches their searches, so there's nothing to show." };
  const quota = await takeRateLimit(db, RATE_LIMITS.adminMailPerUser, admin.id);
  if (!quota.allowed) return { ok: false, error: "That's a lot of email this hour. Try again later." };
  const { props, oneClick } = emailProps(built, admin.id);
  const result = await sendMail({
    to: admin.email,
    subject: `${DIGEST_TEST_PREFIX}${digestSubject(built.total, props.severalSearches)}`,
    react: DigestEmail(props),
    text: digestText(props),
    kind: "digest",
    ref: "test",
    oneClickUnsubscribeUrl: oneClick,
    apiKey: digestResendKey(),
  });
  log.info("digest.test", { ok: result.ok, total: built.total, fallback });
  return result.ok ? { ok: true, data: { to: admin.email, total: built.total, fallback } } : { ok: false, error: result.error ?? "The test didn't send." };
}

/** The master switch. Turning it on is refused while anything blocks the digest. */
export async function setDigestSwitch(db: Db, enabled: boolean, adminId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (enabled) {
    const blockers = digestBlockers();
    if (blockers.length) return { ok: false, error: blockers.join(" ") };
  }
  await setSetting(db, "digest", { enabled }, adminId);
  log.info("digest.switch", { enabled });
  return { ok: true };
}

/* --------------------------------------------- the person's own controls */

export type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

async function writable(db: Db): Promise<string | null> {
  try {
    await assertWritable(db);
    return null;
  } catch (e) {
    if (e instanceof ReadOnlyError) return e.message;
    throw e;
  }
}

export interface MySavedSearch {
  id: number;
  name: string;
  /** The filters in words. */
  summary: string;
  /** `/browse?…`, to open it. */
  href: string;
}

export interface MyAlerts {
  digestOn: boolean;
  /** The admin set Stop email on the account (they asked for no mail): the digest skips them even when on. */
  stoppedEmail: boolean;
  searches: MySavedSearch[];
  max: number;
}

export async function myAlerts(db: DbOrTx, userId: string): Promise<MyAlerts> {
  const [rows, sub, sems, [me]] = await Promise.all([
    savedSearchesFor(db, userId),
    digestSubscriptionFor(db, userId),
    db.select({ code: semesters.code, name: semesters.name }).from(semesters),
    db.select({ noEmail: user.noEmail }).from(user).where(eq(user.id, userId)),
  ]);
  const names = new Map(sems.map((s) => [s.code, s.name]));
  return {
    digestOn: sub.enabled,
    stoppedEmail: me?.noEmail ?? false,
    max: DIGEST.maxSavedSearches,
    searches: rows.map((r) => {
      const q = parseSavedQuery(r.query);
      return { id: r.id, name: r.name, summary: describeFilters(q, q.semester ? names.get(q.semester) : undefined), href: r.query ? `/browse?${r.query}` : "/browse" };
    }),
  };
}

/**
 * "Get alerts for this search": stores Browse's current filters (made
 * canonical by Browse's own parser) under a name. `enableDigest` turns the
 * weekly email on in the same press; the button says so before it is
 * pressed. Saving alone never turns mail on.
 */
export async function saveSearch(db: Db, userId: string, raw: unknown): Promise<Result<{ id: number; digestOn: boolean }>> {
  const parsed = saveSearchInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "That search can't be saved." };
  const ro = await writable(db);
  if (ro) return { ok: false, error: ro };
  const query = canonicalFilterQuery(parsed.data.query);
  const r = await insertSavedSearch(db, userId, { name: parsed.data.name, query });
  if (!r.ok) {
    if (r.reason === "duplicate") return { ok: false, error: "You've already saved this search." };
    if (r.reason === "limit") return { ok: false, error: `You have ${DIGEST.maxSavedSearches} saved searches, the most there can be. Delete one on Account first.` };
    return { ok: false, error: "Sign in again to save a search." };
  }
  if (parsed.data.enableDigest) await setDigestEnabled(db, userId, true, "account");
  const { enabled } = await digestSubscriptionFor(db, userId);
  log.info("digest.search_saved", { ref: r.id, digestOn: enabled });
  return { ok: true, data: { id: r.id, digestOn: enabled } };
}

export async function renameSearch(db: Db, userId: string, raw: unknown): Promise<Result> {
  const parsed = renameSearchInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the name." };
  const ro = await writable(db);
  if (ro) return { ok: false, error: ro };
  return (await renameSavedSearch(db, userId, parsed.data.id, parsed.data.name)) ? { ok: true, data: undefined } : { ok: false, error: "That search is gone." };
}

export async function deleteSearch(db: Db, userId: string, raw: unknown): Promise<Result> {
  const parsed = deleteSearchInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "That search is gone." };
  const ro = await writable(db);
  if (ro) return { ok: false, error: ro };
  return (await deleteSavedSearch(db, userId, parsed.data.id)) ? { ok: true, data: undefined } : { ok: false, error: "That search is gone." };
}

/** The Account toggle. */
export async function setMyDigest(db: Db, userId: string, raw: unknown): Promise<Result<{ enabled: boolean }>> {
  const parsed = digestToggleInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Try again." };
  const ro = await writable(db);
  if (ro) return { ok: false, error: ro };
  await setDigestEnabled(db, userId, parsed.data.enabled, "account");
  log.info("digest.toggle", { enabled: parsed.data.enabled, via: "account" });
  return { ok: true, data: { enabled: parsed.data.enabled } };
}

/* ---------------------------------------------------------- unsubscribe */

export type UnsubscribeState = { state: "invalid" } | { state: "open"; enabled: boolean };

/** What /unsubscribe shows for a token. Reads only: opening the page (or a scanner fetching it) changes nothing. */
export async function unsubscribePageState(db: DbOrTx, token: unknown): Promise<UnsubscribeState> {
  const v = verifyDigestUnsubscribe(token);
  if (!v) return { state: "invalid" };
  return { state: "open", enabled: (await digestSubscriptionFor(db, v.userId)).enabled };
}

/**
 * Turn the named account's digest off: the page's confirm button and the
 * RFC 8058 one-click POST both land here. Saved searches stay. Works while
 * the site is read-only (stopping mail must always work) and answers the
 * same whether the account still exists or the digest was already off, so
 * a token is not a way to learn anything.
 */
export async function unsubscribeWithToken(db: DbOrTx, token: unknown, via: "page" | "one_click"): Promise<{ ok: boolean }> {
  const v = verifyDigestUnsubscribe(token);
  if (!v) return { ok: false };
  const [exists] = await db.select({ id: user.id }).from(user).where(eq(user.id, v.userId));
  if (exists) await setDigestEnabled(db, v.userId, false, "link");
  log.info("digest.unsubscribe", { via });
  return { ok: true };
}
