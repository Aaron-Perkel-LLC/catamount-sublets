import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Db } from "./index";
import * as schema from "./schema";

/**
 * A fresh, migrated, in-memory Postgres for a test file. Runs the real
 * migrations in drizzle/, so a test exercises the same constraints production
 * has. Call close() in afterAll.
 *
 * `upTo` stops after that migration (its tag, e.g. "0009_young_magma"), so a
 * test can insert rows as they were and then run the rest with migrateRest().
 */
export async function createTestDb(opts: { upTo?: string } = {}): Promise<{ db: Db; close: () => Promise<void>; migrateRest: () => Promise<void> }> {
  const client = new PGlite();
  const db = drizzle({ client, schema, casing: "snake_case" });
  if (opts.upTo) {
    const dir = mkdtempSync(path.join(tmpdir(), "migrations-"));
    try {
      cpSync("drizzle", dir, { recursive: true });
      const journalPath = path.join(dir, "meta/_journal.json");
      const journal = JSON.parse(readFileSync(journalPath, "utf8")) as { entries: { tag: string }[] };
      const end = journal.entries.findIndex((e) => e.tag === opts.upTo);
      if (end === -1) throw new Error(`no migration ${opts.upTo}`);
      writeFileSync(journalPath, JSON.stringify({ ...journal, entries: journal.entries.slice(0, end + 1) }));
      await migrate(db, { migrationsFolder: dir });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  } else {
    await migrate(db, { migrationsFolder: "drizzle" });
  }
  return {
    db: db as unknown as Db,
    close: () => client.close(),
    migrateRest: () => migrate(db, { migrationsFolder: "drizzle" }),
  };
}
