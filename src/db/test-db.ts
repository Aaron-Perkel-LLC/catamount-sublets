import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Db } from "./index";
import * as schema from "./schema";

/**
 * A fresh, migrated, in-memory Postgres for a test file. Runs the real
 * migrations in drizzle/, so a test exercises the same constraints production
 * has. Call close() in afterAll.
 */
export async function createTestDb(): Promise<{ db: Db; close: () => Promise<void> }> {
  const client = new PGlite();
  const db = drizzle({ client, schema, casing: "snake_case" });
  await migrate(db, { migrationsFolder: "drizzle" });
  return { db: db as unknown as Db, close: () => client.close() };
}
