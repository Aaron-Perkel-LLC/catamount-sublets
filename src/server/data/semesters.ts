import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { listings, listingSemesters, semesters } from "@/db/schema";
import { orderSemesterCodes, semesterLabel, semestersBackToBack, sortSemesters } from "@/lib/semesters";
import { publicListingWhere } from "./visibility";

export interface SemesterRow {
  code: string;
  name: string;
  active: boolean;
  sortOrder: number;
  archivedAt: Date | null;
}

export interface ListingSemester {
  code: string;
  name: string;
  open: boolean;
}

/** Every semester, in calendar order. */
export async function allSemesters(db: DbOrTx): Promise<SemesterRow[]> {
  const rows = await db.select().from(semesters);
  return sortSemesters(rows);
}

/** The semesters a listing may be posted for: active, in calendar order. */
export async function activeSemesters(db: DbOrTx): Promise<SemesterRow[]> {
  const rows = await db.select().from(semesters).where(eq(semesters.active, true));
  return sortSemesters(rows);
}

/**
 * Every semester of each listing, keyed by listing id, in calendar order.
 * One query for the whole page.
 */
export async function listingSemestersByListing(db: DbOrTx, ids: readonly number[]): Promise<Map<number, ListingSemester[]>> {
  const map = new Map<number, ListingSemester[]>();
  const unique = [...new Set(ids)];
  if (unique.length === 0) return map;
  const rows = await db
    .select({
      listingId: listingSemesters.listingId,
      code: listingSemesters.semesterCode,
      name: semesters.name,
      open: semesters.active,
      position: listingSemesters.position,
    })
    .from(listingSemesters)
    .innerJoin(semesters, eq(semesters.code, listingSemesters.semesterCode))
    .where(inArray(listingSemesters.listingId, unique))
    .orderBy(asc(listingSemesters.listingId), asc(listingSemesters.position));
  for (const r of rows) {
    const list = map.get(r.listingId) ?? [];
    list.push({ code: r.code, name: r.name, open: r.open });
    map.set(r.listingId, list);
  }
  return map;
}

/**
 * "Summer & Fall 2027" for a listing's semesters: the open ones only when
 * `openOnly` (what students see), all of them for the admin.
 */
export function labelFor(list: readonly ListingSemester[], openOnly: boolean): { label: string; codes: string[] } {
  const shown = openOnly ? list.filter((s) => s.open) : [...list];
  const chosen = shown.length > 0 ? shown : [...list];
  return { label: semesterLabel(chosen.map((s) => s.name)), codes: chosen.map((s) => s.code) };
}

export class SemesterChoiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SemesterChoiceError";
  }
}

/**
 * Validate a poster's choice against what is offered: at least one code,
 * every code offered (active, or one the listing already has), and back to
 * back by name. Returns the codes numbered in calendar order.
 */
export function validateSemesterChoice(
  codes: readonly string[],
  offered: readonly { code: string; name: string; sortOrder?: number }[],
): { code: string; position: number }[] {
  const unique = [...new Set(codes)];
  if (unique.length === 0) throw new SemesterChoiceError("Pick the semester your place is available for.");
  const byCode = new Map(offered.map((o) => [o.code, o]));
  const chosen = unique.map((c) => {
    const o = byCode.get(c);
    if (!o) throw new SemesterChoiceError("One of those semesters isn't open for new listings.");
    return o;
  });
  if (!semestersBackToBack(chosen.map((o) => o.name))) {
    throw new SemesterChoiceError("Semesters have to be back to back, like Summer and Fall. Post again once the first one is over.");
  }
  return orderSemesterCodes(chosen);
}

/**
 * Replace a listing's semesters. `ordered` comes from validateSemesterChoice()
 * (or the migration script). Call inside the listing's transaction.
 */
export async function setListingSemesters(
  tx: DbOrTx,
  listingId: number,
  ordered: readonly { code: string; position: number }[],
): Promise<void> {
  await tx.delete(listingSemesters).where(eq(listingSemesters.listingId, listingId));
  if (ordered.length === 0) return;
  await tx
    .insert(listingSemesters)
    .values(ordered.map((o) => ({ listingId, semesterCode: o.code, position: o.position })));
}

/**
 * The semesters students can filter by: the active semesters of listings on
 * the board, in calendar order.
 */
export async function boardSemesters(db: DbOrTx): Promise<{ code: string; name: string }[]> {
  const rows = await db
    .selectDistinct({ code: semesters.code, name: semesters.name, sortOrder: semesters.sortOrder })
    .from(listings)
    .innerJoin(listingSemesters, eq(listingSemesters.listingId, listings.id))
    .innerJoin(semesters, eq(semesters.code, listingSemesters.semesterCode))
    .where(and(publicListingWhere(), eq(semesters.active, true)));
  return sortSemesters(rows).map(({ code, name }) => ({ code, name }));
}

/** Active semesters with no listing on the board, for the filter's "(none yet)". */
export async function emptyActiveSemesters(db: DbOrTx): Promise<{ code: string; name: string }[]> {
  const rows = await db
    .select({ code: semesters.code, name: semesters.name, sortOrder: semesters.sortOrder })
    .from(semesters)
    .where(
      and(
        eq(semesters.active, true),
        sql`not exists (select 1 from ${listings} l join ${listingSemesters} ls on ls.listing_id = l.id
              where ls.semester_code = ${semesters.code} and l.status = 'open')`,
      ),
    );
  return sortSemesters(rows).map(({ code, name }) => ({ code, name }));
}

/** Listings that run for a semester (the admin's post count and delete guard). */
export async function listingCountForSemester(db: DbOrTx, code: string): Promise<number> {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(listingSemesters)
    .where(eq(listingSemesters.semesterCode, code));
  return n;
}
