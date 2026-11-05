import { describe, expect, it } from "vitest";
import { nextSort, sortRows } from "./sort";

const rows = [
  { name: "sam", joined: "2026-10-09T12:00:00Z", post: 10 },
  { name: "Alex", joined: "2026-10-10T12:00:00Z", post: null },
  { name: "bea", joined: "2026-10-08T12:00:00Z", post: 9 },
  { name: "", joined: "2026-10-07T12:00:00Z", post: 187 },
];
type Key = keyof (typeof rows)[number];
const v = (r: (typeof rows)[number], k: Key) => r[k];

describe("sortRows", () => {
  it("sorts text ignoring case, empty last either way", () => {
    expect(sortRows(rows, v, { key: "name", dir: "asc" }).map((r) => r.name)).toEqual(["Alex", "bea", "sam", ""]);
    expect(sortRows(rows, v, { key: "name", dir: "desc" }).map((r) => r.name)).toEqual(["sam", "bea", "Alex", ""]);
  });
  it("sorts ISO dates newest first and numbers numerically, nulls last", () => {
    expect(sortRows(rows, v, { key: "joined", dir: "desc" }).map((r) => r.name)).toEqual(["Alex", "sam", "bea", ""]);
    expect(sortRows(rows, v, { key: "post", dir: "asc" }).map((r) => r.post)).toEqual([9, 10, 187, null]);
    expect(sortRows(rows, v, { key: "post", dir: "desc" }).map((r) => r.post)).toEqual([187, 10, 9, null]);
  });
  it("leaves the input alone", () => {
    const before = rows.map((r) => r.name);
    sortRows(rows, v, { key: "name", dir: "asc" });
    expect(rows.map((r) => r.name)).toEqual(before);
  });
});

describe("nextSort", () => {
  it("flips the current column and starts a new one in its own direction", () => {
    expect(nextSort({ key: "joined", dir: "desc" }, "joined", "desc")).toEqual({ key: "joined", dir: "asc" });
    expect(nextSort({ key: "joined", dir: "desc" }, "name", "asc")).toEqual({ key: "name", dir: "asc" });
  });
});
