import "server-only";
import type { SemesterRowDto } from "@/components/admin/types";
import type { DbOrTx } from "@/db";
import { semesters } from "@/db/schema";
import { sortSemesters } from "@/lib/semesters";
import { listingCountForSemester } from "./semesters";

/** Every semester in calendar order with how many listings run for it, for the admin's pickers. */
export async function semesterRows(db: DbOrTx): Promise<SemesterRowDto[]> {
  const rows = sortSemesters(await db.select().from(semesters));
  return Promise.all(rows.map(async (s) => ({ code: s.code, name: s.name, active: s.active, archivedAt: s.archivedAt?.toISOString() ?? null, postCount: await listingCountForSemester(db, s.code) })));
}
