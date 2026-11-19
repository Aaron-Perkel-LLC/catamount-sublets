import { describe, expect, it } from "vitest";
import { attentionFlags } from "./admin-attention";

const NOW = new Date("2026-11-18T17:00:00Z");
const base = { status: "open", onBoard: true, postedAt: "2026-11-01T15:00:00Z", confirmedAvailableAt: null, views: 5, contacts: 1, views14: 2 };

describe("attentionFlags", () => {
  it("flags nothing for a healthy listing", () => {
    expect(attentionFlags(base, NOW)).toEqual([]);
  });
  it("no views in 14 days, but not for a listing too new to have had any", () => {
    expect(attentionFlags({ ...base, views14: 0 }, NOW)).toEqual(["no-views"]);
    expect(attentionFlags({ ...base, views14: 0, postedAt: "2026-11-17T15:00:00Z" }, NOW)).toEqual([]);
    expect(attentionFlags({ ...base, views14: 0, onBoard: false }, NOW)).toEqual([]);
  });
  it("60+ days old and never confirmed, while open", () => {
    expect(attentionFlags({ ...base, postedAt: "2026-09-10T15:00:00Z" }, NOW)).toEqual(["unconfirmed"]);
    expect(attentionFlags({ ...base, postedAt: "2026-09-10T15:00:00Z", confirmedAvailableAt: "2026-11-01T00:00:00Z" }, NOW)).toEqual([]);
    expect(attentionFlags({ ...base, postedAt: "2026-09-10T15:00:00Z", status: "taken", onBoard: false }, NOW)).toEqual([]);
  });
  it("views but no contacts only from 3 views up", () => {
    expect(attentionFlags({ ...base, contacts: 0 }, NOW)).toEqual(["no-contacts"]);
    expect(attentionFlags({ ...base, contacts: 0, views: 2 }, NOW)).toEqual([]);
  });
});
