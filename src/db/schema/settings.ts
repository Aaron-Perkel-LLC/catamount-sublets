import { jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { updatedAt } from "./helpers";

/**
 * Site-wide switches, one row each, typed by key in src/server/data/settings.ts:
 *   announcement  {active, message, style}
 *   read_only     {active, message}      every write action refuses while active
 * (A `launched` row from before launch may remain in production; nothing reads it.)
 */
export const siteSettings = pgTable("site_settings", {
  key: text().primaryKey(),
  value: jsonb().$type<Record<string, unknown>>().notNull(),
  updatedAt: updatedAt(),
  updatedByUserId: uuid(),
});
