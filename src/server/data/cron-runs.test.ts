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
    expect(
      cronSummary({ acted: false, reason: "not_digest_day", week: "2026-11-23", sent: 2, skipped: { banned: 1, deep: { x: 1 } }, ids: [4, 5], who: "a@b.c", long: "x".repeat(41), user: "0b9f3c2e-4d4a-4c5e-9a8b-1c2d3e4f5a6b", key: "a1b2c3d4" }),
    ).toEqual({
      acted: false,
      reason: "not_digest_day",
      week: "2026-11-23",
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
      "digest:failed": { at: "2026-11-18T10:00:00.000Z", ok: false, summary: {} },
    });
  });

  it("keeps the last run that acted after idle hourly runs replace the latest", async () => {
    await recordCronRun(db, "digest", true, { acted: true, sent: 4 }, new Date("2026-11-23T13:00:00Z"));
    await recordCronRun(db, "digest", true, { acted: false, reason: "not_the_day" }, new Date("2026-11-23T14:00:00Z"));
    const runs = await getSetting(db, "cron_runs");
    expect(runs.digest.summary).toEqual({ acted: false, reason: "not_the_day" });
    expect(runs["digest:acted"]).toEqual({ at: "2026-11-23T13:00:00.000Z", ok: true, summary: { acted: true, sent: 4 } });
    expect(runs["digest:failed"].at).toBe("2026-11-18T10:00:00.000Z");
  });
});
