import { SemestersTab } from "@/components/admin/SemestersTab";
import { getDb } from "@/db";
import { requireAdminPage } from "@/server/auth";
import { semesterRows } from "@/server/data/admin-semesters";
import { archiveHistory } from "@/server/services/admin";

/** What students can post for, the archive, and the "still available?" email. */
export default async function AdminSemesters() {
  await requireAdminPage("/admin/semesters");
  const db = await getDb();
  const [rows, archives] = await Promise.all([semesterRows(db), archiveHistory(db)]);
  return <SemestersTab semesters={rows} archives={archives.map((a) => ({ ...a, archivedAt: a.archivedAt.toISOString() }))} />;
}
