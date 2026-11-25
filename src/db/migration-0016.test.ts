import { type SQL, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "./index";
import { createTestDb } from "./test-db";

/**
 * 0016: listings gain rooms_available (default 1), price_basis (default
 * 'room') and the generated price_per_room. Every existing listing becomes
 * one room priced per room, so its per-room price is its price and nothing
 * sorts, filters or shows differently. Rows are written with raw SQL against
 * the 0015 schema, including a studio (bedrooms 0) and blank size fields.
 */
let db: Db;
let close: () => Promise<void>;
let migrateRest: () => Promise<void>;
const rows = async (q: SQL) => ((await db.execute(q)) as unknown as { rows: Record<string, unknown>[] }).rows;
const users = ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002", "00000000-0000-4000-8000-000000000003"];

beforeAll(async () => {
  ({ db, close, migrateRest } = await createTestDb({ upTo: "0015_clammy_black_panther" }));
  for (const [i, id] of users.entries()) await db.execute(sql`insert into "user" (id, email, name) values (${id}, ${`p${i}@uvm.edu`}, 'p')`);
  await db.execute(sql`insert into listings (id, user_id, price, address, lat, lon, bedrooms, roommates) values
    (10, ${users[0]}, 850, '1 A St', 44.47, -73.2, 3, 2),
    (11, ${users[1]}, 3200, '2 B St', 44.47, -73.2, 0, 0),
    (12, ${users[2]}, 975.50, '3 C St', 44.47, -73.2, null, null)`);
  await migrateRest();
});
afterAll(() => close());

describe("migration 0016", () => {
  it("makes every existing listing one room priced per room, its per-room price its price", async () => {
    expect(await rows(sql`select id, rooms_available, price_basis, price::float as price, price_per_room::float as per_room from listings order by id`)).toEqual([
      { id: 10, rooms_available: 1, price_basis: "room", price: 850, per_room: 850 },
      { id: 11, rooms_available: 1, price_basis: "room", price: 3200, per_room: 3200 },
      { id: 12, rooms_available: 1, price_basis: "room", price: 975.5, per_room: 975.5 },
    ]);
  });

  it("recomputes the per-room price from price, basis and rooms, to whole dollars", async () => {
    await db.execute(sql`update listings set bedrooms = 4, roommates = 0, rooms_available = 3, price_basis = 'total' where id = 10`);
    await db.execute(sql`update listings set price = 3200 where id = 10`);
    expect((await rows(sql`select price_per_room::float as v from listings where id = 10`))[0].v).toBe(1067);
    await db.execute(sql`update listings set price = 2001, rooms_available = 2 where id = 10`);
    expect((await rows(sql`select price_per_room::float as v from listings where id = 10`))[0].v).toBe(1001); // as previewPerRoom
    await db.execute(sql`update listings set price_basis = 'room' where id = 10`);
    expect((await rows(sql`select price_per_room::float as v from listings where id = 10`))[0].v).toBe(2001);
  });

  it("refuses rooms beyond the bedrooms, a multi-room listing without bedrooms or roommates, and a whole-place price for one room", async () => {
    const fails = async (q: SQL, constraint: RegExp) => {
      let err: unknown;
      try {
        await db.execute(q);
      } catch (e) {
        err = e;
      }
      expect(String((err as { cause?: unknown })?.cause ?? err)).toMatch(constraint);
    };
    await fails(sql`update listings set rooms_available = 2 where id = 11`, /listings_rooms_bedrooms_check/); // a studio
    await fails(sql`update listings set rooms_available = 2 where id = 12`, /listings_rooms_bedrooms_check/); // bedrooms blank
    await fails(sql`update listings set rooms_available = 2, bedrooms = 2 where id = 12`, /listings_rooms_roommates_check/);
    await fails(sql`update listings set price_basis = 'total' where id = 11`, /listings_price_basis_check/);
    await fails(sql`update listings set price_per_room = 1 where id = 11`, /can only be updated to DEFAULT/);
  });
});
