import { PhotosSection } from "@/components/admin/sections/PhotosSection";
import { getDb } from "@/db";
import { requireAdminPage } from "@/server/auth";
import { semesterRows } from "@/server/data/admin-semesters";
import { adminStats } from "@/server/services/admin";

/** Every listing's photos, the bulk delete and the orphan sweep. */
export default async function AdminPhotos() {
  await requireAdminPage("/admin/photos");
  const db = await getDb();
  const [rows, stats] = await Promise.all([semesterRows(db), adminStats(db)]);
  return <PhotosSection semesters={rows} storage={stats.storage} />;
}
