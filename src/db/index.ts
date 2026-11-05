import { Pool } from "@neondatabase/serverless";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from "drizzle-orm/pg-core";
import * as schema from "./schema";

/**
 * The app's database.
 *
 * On Vercel and whenever DATABASE_URL is set: Neon over its WebSocket Pool
 * (not neon-http), because photo reordering, the archive and account deletion
 * need interactive transactions. `casing` must match drizzle.config.ts.
 *
 * With no DATABASE_URL outside production: an in-process PGlite Postgres in
 * `.pglite/` (gitignored), migrated on first use, so a fresh clone runs with
 * no account anywhere. Tests use src/db/test-db.ts instead.
 */

export type Schema = typeof schema;
export type Db = PgDatabase<PgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;
export type Tx = PgTransaction<PgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;
/** A database or a transaction: what data-access functions accept. */
export type DbOrTx = Db | Tx;

/**
 * One connection per process, kept on globalThis: in `next dev` the page,
 * Server Action and route-handler bundles each load this module, and two
 * PGlite instances on one `.pglite/` directory never see each other's writes
 * (a name saved by an action was invisible to the page that read it next).
 */
const shared = globalThis as typeof globalThis & { __catamountDb?: { db?: Db; pending?: Promise<Db> } };
const cache = (shared.__catamountDb ??= {});

function connectNeon(url: string): Db {
  return drizzleNeon({ client: new Pool({ connectionString: url }), schema, casing: "snake_case" }) as unknown as Db;
}

async function connectPglite(): Promise<Db> {
  if (process.env.VERCEL_ENV === "production") {
    throw new Error("DATABASE_URL is not set in production");
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const client = new PGlite(process.env.PGLITE_DATA_DIR ?? ".pglite");
  const local = drizzle({ client, schema, casing: "snake_case" });
  await migrate(local, { migrationsFolder: "drizzle" });
  return local as unknown as Db;
}

/** The database, created on first use. */
export async function getDb(): Promise<Db> {
  if (cache.db) return cache.db;
  if (!cache.pending) {
    const url = process.env.DATABASE_URL;
    cache.pending = (url ? Promise.resolve(connectNeon(url)) : connectPglite()).then((d) => (cache.db = d));
  }
  return cache.pending;
}

export { schema };
