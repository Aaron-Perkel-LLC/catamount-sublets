import { type SQL, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "./index";
import { createTestDb } from "./test-db";

/**
 * 0013: listing_events.listing_id loses its foreign key, so a listing's
 * events outlive it (and its poster's account). Rows written before the
 * migration keep their listing id; nothing is rewritten.
 */
let db: Db;
let close: () => Promise<void>;
let migrateRest: () => Promise<void>;
const rows = async (q: SQL) => ((await db.execute(q)) as unknown as { rows: Record<string, unknown>[] }).rows;

beforeAll(async () => {
  ({ db, close, migrateRest } = await createTestDb({ upTo: "0012_abnormal_oracle" }));
  await db.execute(sql`insert into "user" (id, email, name) values ('00000000-0000-4000-8000-000000000001', 'one@uvm.edu', 'one')`);
  await db.execute(sql`insert into listings (id, user_id, price, address, lat, lon) values (41, '00000000-0000-4000-8000-000000000001', 800, 'a', 44.47, -73.2)`);
  await db.execute(sql`insert into listing_events (listing_id, actor_key, type, source) values (41, '0123456789abcdef', 'copy_email', 'browse')`);
  await migrateRest();
});
afterAll(() => close());

describe("migration 0013", () => {
  it("keeps the events of a deleted listing and of a deleted account", async () => {
    await db.execute(sql`delete from "user" where id = '00000000-0000-4000-8000-000000000001'`);
    expect(await rows(sql`select id from listings`)).toEqual([]);
    expect(await rows(sql`select listing_id, type from listing_events`)).toEqual([{ listing_id: 41, type: "copy_email" }]);
  });

  it("drops only that foreign key", async () => {
    const fks = await rows(sql`select conname from pg_constraint where conrelid = 'listing_events'::regclass and contype = 'f'`);
    expect(fks).toEqual([]);
    const notNull = await rows(sql`select is_nullable from information_schema.columns where table_name = 'listing_events' and column_name = 'listing_id'`);
    expect(notNull).toEqual([{ is_nullable: "NO" }]);
  });
});
