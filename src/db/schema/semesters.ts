import { boolean, integer, pgTable, text } from "drizzle-orm/pg-core";
import { createdAt, nullableTimestamp } from "./helpers";

/**
 * A semester listings can run for. `code` is the key ("spring27"); `name`
 * ("Spring 2027") is what the calendar rules in src/lib/semesters.ts read.
 * Deactivating hides every listing that runs only for it; archiving
 * (archived_at) is the step after that and deletes those listings.
 */
export const semesters = pgTable("semesters", {
  code: text().primaryKey(),
  name: text().notNull(),
  active: boolean().notNull().default(true),
  sortOrder: integer().notNull().default(0),
  archivedAt: nullableTimestamp(),
  createdAt: createdAt(),
});
