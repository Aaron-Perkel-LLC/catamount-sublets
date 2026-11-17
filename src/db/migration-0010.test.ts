import { type SQL, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "./index";
import { createTestDb } from "./test-db";

/**
 * 0010: everyone who posted before signed-out browsing existed posted for
 * signed-in students, so every listing that exists when it runs becomes
 * signed-in only; a listing inserted afterwards defaults to public. Rows are
 * written with raw SQL against the 0009 schema, as they were.
 */
let db: Db;
let close: () => Promise<void>;
let migrateRest: () => Promise<void>;
/** PGlite's result rows (Db's execute() is typed for every driver, so its rows are unknown). */
const rows = async (q: SQL) => ((await db.execute(q)) as unknown as { rows: Record<string, unknown>[] }).rows;

beforeAll(async () => {
  ({ db, close, migrateRest } = await createTestDb({ upTo: "0009_young_magma" }));
  await db.execute(sql`insert into "user" (id, email, name) values
    ('00000000-0000-4000-8000-000000000001', 'one@uvm.edu', 'one'),
    ('00000000-0000-4000-8000-000000000002', 'two@uvm.edu', 'two'),
    ('00000000-0000-4000-8000-000000000003', 'three@uvm.edu', 'three')`);
  await db.execute(sql`insert into listings (user_id, price, address, lat, lon, status) values
    ('00000000-0000-4000-8000-000000000001', 800, '1 A St', 44.47, -73.2, 'open'),
    ('00000000-0000-4000-8000-000000000002', 900, '2 B St', 44.48, -73.21, 'paused')`);
  await migrateRest();
});
afterAll(() => close());

describe("migration 0010", () => {
  it("makes every existing listing signed-in only, with no area yet", async () => {
    expect(await rows(sql`select address, signed_in_only, area_lat, area_lon from listings order by id`)).toEqual([
      { address: "1 A St", signed_in_only: true, area_lat: null, area_lon: null },
      { address: "2 B St", signed_in_only: true, area_lat: null, area_lon: null },
    ]);
  });

  it("defaults a new listing to public", async () => {
    await db.execute(sql`insert into listings (user_id, price, address, lat, lon) values ('00000000-0000-4000-8000-000000000003', 700, '3 C St', 44.46, -73.22)`);
    const [row] = await rows(sql`select signed_in_only from listings where address = '3 C St'`);
    expect(row).toEqual({ signed_in_only: false });
  });

  it("counts existing events as signed in", async () => {
    const [col] = await rows(sql`select column_default, is_nullable from information_schema.columns where table_name = 'listing_events' and column_name = 'signed_out'`);
    expect(col).toEqual({ column_default: "false", is_nullable: "NO" });
  });

  it("will not take half an area", async () => {
    await expect(db.execute(sql`update listings set area_lat = 44.5 where address = '3 C St'`)).rejects.toThrow();
  });
});
