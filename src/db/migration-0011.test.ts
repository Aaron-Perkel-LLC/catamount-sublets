import { readdirSync, readFileSync } from "node:fs";
import { type SQL, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PUBLIC_BY_DEFAULT_SINCE } from "@/lib/visibility-rollout";
import type { Db } from "./index";
import { createTestDb } from "./test-db";

/**
 * 0011: a nullable visibility_chosen_at, filled only for a listing posted
 * before 0010 that is public (its poster must have switched it, at or before
 * updated_at). Rows are written with raw SQL against the 0010 schema.
 */
let db: Db;
let close: () => Promise<void>;
let migrateRest: () => Promise<void>;
const rows = async (q: SQL) => ((await db.execute(q)) as unknown as { rows: Record<string, unknown>[] }).rows;

beforeAll(async () => {
  ({ db, close, migrateRest } = await createTestDb({ upTo: "0010_mute_payback" }));
  await db.execute(sql`insert into "user" (id, email, name) values
    ('00000000-0000-4000-8000-000000000001', 'one@uvm.edu', 'one'),
    ('00000000-0000-4000-8000-000000000002', 'two@uvm.edu', 'two'),
    ('00000000-0000-4000-8000-000000000003', 'three@uvm.edu', 'three')`);
  await db.execute(sql`insert into listings (user_id, price, address, lat, lon, signed_in_only, posted_at, updated_at) values
    ('00000000-0000-4000-8000-000000000001', 800, 'switched', 44.47, -73.2, false, '2026-10-01T12:00:00Z', '2026-11-17T06:00:00Z'),
    ('00000000-0000-4000-8000-000000000002', 900, 'untouched', 44.48, -73.21, true, '2026-10-01T12:00:00Z', '2026-10-02T12:00:00Z'),
    ('00000000-0000-4000-8000-000000000003', 700, 'new', 44.46, -73.22, false, '2026-11-17T08:00:00Z', '2026-11-17T08:00:00Z')`);
  await migrateRest();
});
afterAll(() => close());

describe("migration 0011", () => {
  it("records a choice only for a listing from before 0010 that is public, at its updated_at", async () => {
    const got = await rows(sql`select address, signed_in_only, visibility_chosen_at from listings order by address`);
    expect(got.map((r) => [r.address, r.signed_in_only, r.visibility_chosen_at && new Date(r.visibility_chosen_at as string).toISOString()])).toEqual([
      ["new", false, null],
      ["switched", false, "2026-11-17T06:00:00.000Z"],
      ["untouched", true, null],
    ]);
  });

  it("uses the same cutoff as the code", () => {
    const file = readdirSync("drizzle").find((f) => f.startsWith("0011_"))!;
    const literals = [...readFileSync(`drizzle/${file}`, "utf8").matchAll(/'(\d{4}-\d\d-\d\dT[\d:]+Z)'/g)].map((m) => new Date(m[1]).getTime());
    expect(literals).toEqual([PUBLIC_BY_DEFAULT_SINCE.getTime()]);
  });
});
