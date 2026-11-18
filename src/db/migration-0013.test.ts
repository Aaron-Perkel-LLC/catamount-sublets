import { type SQL, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "./index";
import { createTestDb } from "./test-db";

/**
 * 0013: user.tier (every account before it a student, community by default
 * after), listings.accepts_outside_messages (on), listing_events and
 * notice_events.viewer_tier (from signed_out), and the empty poster_messages
 * table. Rows are written with raw SQL against the 0012 schema.
 */
let db: Db;
let close: () => Promise<void>;
let migrateRest: () => Promise<void>;
const rows = async (q: SQL) => ((await db.execute(q)) as unknown as { rows: Record<string, unknown>[] }).rows;

beforeAll(async () => {
  ({ db, close, migrateRest } = await createTestDb({ upTo: "0012_abnormal_oracle" }));
  await db.execute(sql`insert into "user" (id, email, name, role) values
    ('00000000-0000-4000-8000-000000000001', 'one@uvm.edu', 'one', 'user'),
    ('00000000-0000-4000-8000-000000000002', 'approved@example.org', 'two', 'user'),
    ('00000000-0000-4000-8000-000000000003', 'admin@catamountsublets.com', 'admin', 'admin')`);
  await db.execute(sql`insert into listings (id, user_id, price, address, lat, lon) values
    (1, '00000000-0000-4000-8000-000000000001', 800, 'a', 44.47, -73.2),
    (2, '00000000-0000-4000-8000-000000000002', 900, 'b', 44.48, -73.21)`);
  await db.execute(sql`insert into listing_events (listing_id, actor_key, signed_out, type) values
    (1, 'aaaaaaaaaaaaaaaa', true, 'listing_open'),
    (1, 'bbbbbbbbbbbbbbbb', false, 'listing_open')`);
  await db.execute(sql`insert into site_notices (id, title, body_md, audience) values
    (1, 'Hello', 'Body', 'everyone')`);
  await db.execute(sql`insert into notice_events (notice_id, type, actor_key, signed_out) values
    (1, 'view', 'aaaaaaaaaaaaaaaa', true),
    (1, 'view', 'bbbbbbbbbbbbbbbb', false)`);
  await migrateRest();
});
afterAll(() => close());

describe("migration 0013", () => {
  it("makes every existing account a student", async () => {
    expect(await rows(sql`select email, tier from "user" order by email`)).toEqual([
      { email: "admin@catamountsublets.com", tier: "student" },
      { email: "approved@example.org", tier: "student" },
      { email: "one@uvm.edu", tier: "student" },
    ]);
  });

  it("defaults a new account to community and refuses an unknown tier", async () => {
    await db.execute(sql`insert into "user" (email, name) values ('new@gmail.com', 'new')`);
    expect(await rows(sql`select tier from "user" where email = 'new@gmail.com'`)).toEqual([{ tier: "community" }]);
    await expect(db.execute(sql`update "user" set tier = 'staff' where email = 'new@gmail.com'`)).rejects.toThrow();
  });

  it("turns outside messages on for every listing", async () => {
    expect(await rows(sql`select id, accepts_outside_messages from listings order by id`)).toEqual([
      { id: 1, accepts_outside_messages: true },
      { id: 2, accepts_outside_messages: true },
    ]);
  });

  it("fills viewer_tier from signed_out on both event tables", async () => {
    expect(await rows(sql`select signed_out, viewer_tier from listing_events order by signed_out`)).toEqual([
      { signed_out: false, viewer_tier: "student" },
      { signed_out: true, viewer_tier: "anonymous" },
    ]);
    expect(await rows(sql`select signed_out, viewer_tier from notice_events order by signed_out`)).toEqual([
      { signed_out: false, viewer_tier: "student" },
      { signed_out: true, viewer_tier: "anonymous" },
    ]);
  });

  it("creates poster_messages empty", async () => {
    expect(await rows(sql`select count(*)::int as n from poster_messages`)).toEqual([{ n: 0 }]);
  });
});
