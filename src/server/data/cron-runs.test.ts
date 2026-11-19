import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/db/test-db";
import { cronSummary, recordCronRun } from "./cron-runs";
import { getSetting } from "./settings";

type Db = Awaited<ReturnType<typeof createTestDb>>["db"];
let db: Db;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());

describe("cron runs", () => {
  it("keeps counts and plain words only, flattened one level", () => {
    expect(cronSummary({ acted: false, reason: "not_digest_day", sent: 2, skipped: { banned: 1, deep: { x: 1 } }, ids: [4, 5], who: "a@b.c", long: "x".repeat(41) })).toEqual({
      acted: false,
      reason: "not_digest_day",
      sent: 2,
      "skipped.banned": 1,
      "ids.count": 2,
    });
  });

  it("records each cron under its own key without clobbering the others", async () => {
    await recordCronRun(db, "sweep", true, { raw: 3 }, new Date("2026-11-18T09:20:00Z"));
    await recordCronRun(db, "digest", false, {}, new Date("2026-11-18T10:00:00Z"));
    await recordCronRun(db, "sweep", true, { raw: 1 }, new Date("2026-11-19T09:20:00Z"));
    expect(await getSetting(db, "cron_runs")).toEqual({
      sweep: { at: "2026-11-19T09:20:00.000Z", ok: true, summary: { raw: 1 } },
      digest: { at: "2026-11-18T10:00:00.000Z", ok: false, summary: {} },
    });
  });
});
