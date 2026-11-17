import "server-only";
import { and, desc, eq, gt, isNull, ne, or, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { noticeDismissals, noticeEvents, siteNotices } from "@/db/schema";
import { easternDate, easternDayStart, nextDate } from "@/lib/dates";
import { audienceMatches, type NoticeAudience, type NoticeDto, type NoticeEventType, NOTICE_EVENT_TYPES, type NoticeValues, type NoticeViewer } from "@/lib/notices";
import { actorKey } from "@/lib/share";

/**
 * Popup notices (PLAN.md row 30). The server decides who gets one: the
 * active notice, not past its end, whose audience takes in the viewer, and
 * (signed in) not dismissed. Nobody outside a notice's audience is ever
 * sent its body. Signed-out dismissals live in the visitor's localStorage.
 */

const live = () => and(eq(siteNotices.active, true), or(isNull(siteNotices.endsAt), gt(siteNotices.endsAt, sql`now()`)));

const toDto = (n: typeof siteNotices.$inferSelect): NoticeDto => ({ id: n.id, title: n.title, bodyMd: n.bodyMd, ctaLabel: n.ctaLabel, ctaHref: n.ctaHref });

/** The notice this viewer should see, or null. */
export async function noticeFor(db: DbOrTx, viewer: NoticeViewer): Promise<NoticeDto | null> {
  const [n] = await db.select().from(siteNotices).where(live()).limit(1);
  if (!n || !audienceMatches(n.audience as NoticeAudience, viewer)) return null;
  if (viewer.kind === "signed-in") {
    const [seen] = await db
      .select({ at: noticeDismissals.dismissedAt })
      .from(noticeDismissals)
      .where(and(eq(noticeDismissals.noticeId, n.id), eq(noticeDismissals.userId, viewer.userId)))
      .limit(1);
    if (seen) return null;
  }
  return toDto(n);
}

export type NoticeActor = { kind: "signed-out"; anonKey: string } | { kind: "signed-in"; userId: string; role: "user" | "admin"; hasListing: boolean };
export type NoticeRecordResult = "stored" | "duplicate" | "excluded" | "invalid";

/**
 * Counts one view, dismissal or CTA click, once per notice, type and actor.
 * Only for a live notice whose audience takes in the actor, so a signed-out
 * request can only ever count an `everyone` notice. Admins are not counted.
 */
export async function recordNoticeEvent(db: DbOrTx, actor: NoticeActor, noticeId: number, type: string): Promise<NoticeRecordResult> {
  if (!Number.isInteger(noticeId) || noticeId <= 0 || !(NOTICE_EVENT_TYPES as readonly string[]).includes(type)) return "invalid";
  const [n] = await db.select({ audience: siteNotices.audience }).from(siteNotices).where(and(eq(siteNotices.id, noticeId), live())).limit(1);
  const viewer: NoticeViewer = actor.kind === "signed-out" ? actor : { kind: "signed-in", userId: actor.userId, hasListing: actor.hasListing };
  if (!n || !audienceMatches(n.audience as NoticeAudience, viewer)) return "invalid";
  if (actor.kind === "signed-in" && actor.role === "admin") return "excluded";
  const inserted = await db
    .insert(noticeEvents)
    .values({
      noticeId,
      type: type as NoticeEventType,
      actorKey: actor.kind === "signed-in" ? actorKey(actor.userId) : actor.anonKey,
      signedOut: actor.kind === "signed-out",
    })
    .onConflictDoNothing()
    .returning({ id: noticeEvents.id });
  return inserted.length > 0 ? "stored" : "duplicate";
}

/**
 * A signed-in person's dismissal (Got it, Escape, the backdrop, or the CTA):
 * the row that stops it showing, and its count, together. A notice that has
 * since been deactivated or deleted is still fine to dismiss (no count, and
 * nothing to dismiss once deleted).
 */
export async function dismissNotice(
  db: DbOrTx,
  actor: Extract<NoticeActor, { kind: "signed-in" }>,
  noticeId: number,
  how: "dismiss" | "cta",
): Promise<"dismissed" | "invalid"> {
  if (!Number.isInteger(noticeId) || noticeId <= 0) return "invalid";
  const [n] = await db.select({ id: siteNotices.id }).from(siteNotices).where(eq(siteNotices.id, noticeId)).limit(1);
  if (!n) return "invalid";
  await db.insert(noticeDismissals).values({ noticeId, userId: actor.userId }).onConflictDoNothing();
  await recordNoticeEvent(db, actor, noticeId, how);
  return "dismissed";
}

// ---- Admin ------------------------------------------------------------------

export interface NoticeAdminRow {
  id: number;
  title: string;
  bodyMd: string;
  audience: NoticeAudience;
  ctaLabel: string | null;
  ctaHref: string | null;
  active: boolean;
  /** The Eastern date it shows through, or null. */
  endsOn: string | null;
  ended: boolean;
  updatedAt: string;
  views: number;
  dismissals: number;
  ctaClicks: number;
}

/** Every notice, newest first, with its counts (distinct people). */
export async function listNoticesForAdmin(db: DbOrTx, now = new Date()): Promise<NoticeAdminRow[]> {
  const notices = await db.select().from(siteNotices).orderBy(desc(siteNotices.id));
  const tallies = await db
    .select({ noticeId: noticeEvents.noticeId, type: noticeEvents.type, n: sql<number>`count(*)::int` })
    .from(noticeEvents)
    .groupBy(noticeEvents.noticeId, noticeEvents.type);
  const tally = (id: number, type: NoticeEventType) => tallies.find((t) => t.noticeId === id && t.type === type)?.n ?? 0;
  return notices.map((n) => ({
    id: n.id,
    title: n.title,
    bodyMd: n.bodyMd,
    audience: n.audience as NoticeAudience,
    ctaLabel: n.ctaLabel,
    ctaHref: n.ctaHref,
    active: n.active,
    endsOn: n.endsAt ? endsOnFor(n.endsAt) : null,
    ended: n.endsAt !== null && n.endsAt.getTime() <= now.getTime(),
    updatedAt: n.updatedAt.toISOString(),
    views: tally(n.id, "view"),
    dismissals: tally(n.id, "dismiss"),
    ctaClicks: tally(n.id, "cta"),
  }));
}

/** An "ends" Eastern date runs to the end of that day: stored as the first instant of the next. */
export const endsAtFor = (endsOn: string | null): Date | null => (endsOn ? easternDayStart(nextDate(endsOn)) : null);
/** And back: the Eastern date of the last instant it shows. */
const endsOnFor = (endsAt: Date): string => easternDate(new Date(endsAt.getTime() - 1));

const columnsFor = (v: NoticeValues, adminId: string) => ({
  title: v.title,
  bodyMd: v.bodyMd,
  audience: v.audience,
  ctaLabel: v.ctaLabel,
  ctaHref: v.ctaHref,
  endsAt: endsAtFor(v.endsOn),
  updatedByUserId: adminId,
});

/** A new notice, inactive. */
export async function createNotice(db: DbOrTx, v: NoticeValues, adminId: string): Promise<number> {
  const [row] = await db.insert(siteNotices).values(columnsFor(v, adminId)).returning({ id: siteNotices.id });
  return row.id;
}

/** Changes the text in place. Anyone who dismissed it does not see it again. */
export async function updateNotice(db: DbOrTx, id: number, v: NoticeValues, adminId: string): Promise<boolean> {
  const rows = await db.update(siteNotices).set(columnsFor(v, adminId)).where(eq(siteNotices.id, id)).returning({ id: siteNotices.id });
  return rows.length > 0;
}

/** Activating one deactivates every other in the same transaction (the partial unique index would refuse two). */
export async function setNoticeActive(db: DbOrTx, id: number, active: boolean, adminId: string): Promise<boolean> {
  class NotFound extends Error {}
  try {
    return await db.transaction(async (tx) => {
      if (active) {
        await tx.update(siteNotices).set({ active: false, updatedByUserId: adminId }).where(and(eq(siteNotices.active, true), ne(siteNotices.id, id)));
      }
      const rows = await tx.update(siteNotices).set({ active, updatedByUserId: adminId }).where(eq(siteNotices.id, id)).returning({ id: siteNotices.id });
      if (rows.length === 0) throw new NotFound(); // rolls back the deactivation too
      return true;
    });
  } catch (e) {
    if (e instanceof NotFound) return false;
    throw e;
  }
}

/** "Show again": the same text as a new, inactive notice (a new id, so nobody has dismissed it). A past end date is dropped. */
export async function duplicateNotice(db: DbOrTx, id: number, adminId: string, now = new Date()): Promise<number | null> {
  const [n] = await db.select().from(siteNotices).where(eq(siteNotices.id, id)).limit(1);
  if (!n) return null;
  const [row] = await db
    .insert(siteNotices)
    .values({
      title: n.title,
      bodyMd: n.bodyMd,
      audience: n.audience,
      ctaLabel: n.ctaLabel,
      ctaHref: n.ctaHref,
      endsAt: n.endsAt && n.endsAt.getTime() > now.getTime() ? n.endsAt : null,
      updatedByUserId: adminId,
    })
    .returning({ id: siteNotices.id });
  return row.id;
}

/** Deletes it with its dismissals and counts. */
export async function deleteNotice(db: DbOrTx, id: number): Promise<boolean> {
  const rows = await db.delete(siteNotices).where(eq(siteNotices.id, id)).returning({ id: siteNotices.id });
  return rows.length > 0;
}
