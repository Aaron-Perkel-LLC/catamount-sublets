import { bigint, integer, jsonb, numeric, pgTable, serial, text } from "drizzle-orm/pg-core";
import { createdAt } from "./helpers";

/** What archiving a semester leaves behind: totals only, never who. */
export interface ArchiveManifest {
  /** Listing id → the photo stems and byte sizes that were deleted. */
  listings?: Record<string, { stems: string[]; bytes: number }>;
  /** For the two semesters archived on the old site: the tarball's name there. */
  legacyTarball?: string;
}

export const semesterArchives = pgTable("semester_archives", {
  id: serial().primaryKey(),
  /** No FK: the semester row is usually deleted after archiving. */
  semesterCode: text().notNull().unique("semester_archives_semester_code_key"),
  semesterName: text().notNull(),
  archivedAt: createdAt(),
  listings: integer().notNull(),
  taken: integer().notNull().default(0),
  priceMedian: numeric({ precision: 10, scale: 2, mode: "number" }),
  priceMin: numeric({ precision: 10, scale: 2, mode: "number" }),
  priceMax: numeric({ precision: 10, scale: 2, mode: "number" }),
  views: integer().notNull().default(0),
  contacts: integer().notNull().default(0),
  shares: integer().notNull().default(0),
  shareArrivals: integer().notNull().default(0),
  photos: integer().notNull().default(0),
  bytes: bigint({ mode: "number" }).notNull().default(0),
  manifest: jsonb().$type<ArchiveManifest>().notNull().default({}),
});
