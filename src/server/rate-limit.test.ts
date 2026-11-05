import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/db/test-db";
import * as s from "@/db/schema";
import { RATE_LIMITS, rateLimitKey, takeRateLimit } from "./rate-limit";

type Db = Awaited<ReturnType<typeof createTestDb>>["db"];
let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());

const rule = { scope: "test", limit: 3, windowSeconds: 60 };

describe("takeRateLimit", () => {
  it("allows up to the limit in a window and refuses the next hit", async () => {
    const t0 = new Date("2026-10-08T12:00:00Z");
    for (let i = 1; i <= 3; i++) {
      const r = await takeRateLimit(db, rule, "alice", t0);
      expect(r.allowed).toBe(true);
      expect(r.count).toBe(i);
      expect(r.remaining).toBe(3 - i);
    }
    const refused = await takeRateLimit(db, rule, "alice", new Date(t0.getTime() + 10_000));
    expect(refused.allowed).toBe(false);
    expect(refused.remaining).toBe(0);
    expect(refused.retryAfterSeconds).toBe(50);
  });

  it("keeps subjects apart", async () => {
    const r = await takeRateLimit(db, rule, "bob");
    expect(r.allowed).toBe(true);
    expect(r.count).toBe(1);
  });

  it("keeps scopes apart", async () => {
    const r = await takeRateLimit(db, { ...rule, scope: "other" }, "alice");
    expect(r.allowed).toBe(true);
    expect(r.count).toBe(1);
  });

  it("starts a new window once the old one has lapsed", async () => {
    const t0 = new Date("2026-10-08T13:00:00Z");
    for (let i = 0; i < 4; i++) await takeRateLimit(db, rule, "carol", t0);
    const later = await takeRateLimit(db, rule, "carol", new Date(t0.getTime() + 61_000));
    expect(later.allowed).toBe(true);
    expect(later.count).toBe(1);
  });

  it("stores a hash, never the subject", async () => {
    await takeRateLimit(db, rule, "dave@uvm.edu");
    const rows = await db.select({ key: s.rateLimitBuckets.key }).from(s.rateLimitBuckets);
    expect(rows.some((r) => r.key.includes("dave"))).toBe(false);
    expect(rows.some((r) => r.key === rateLimitKey("test", "dave@uvm.edu"))).toBe(true);
  });

  it("the shipped rules are sane", () => {
    for (const r of Object.values(RATE_LIMITS)) {
      expect(r.limit).toBeGreaterThan(0);
      expect(r.windowSeconds).toBeGreaterThan(0);
      expect(r.windowSeconds).toBeLessThanOrEqual(86_400);
    }
  });
});
