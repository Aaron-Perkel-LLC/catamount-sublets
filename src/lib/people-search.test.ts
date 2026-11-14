import { describe, expect, it } from "vitest";
import { escapeLike, highlightParts, PEOPLE_QUERY_MAX, parsePeopleQuery, peopleQuery } from "./people-search";

describe("people search input", () => {
  it("trims and caps the query", () => {
    expect(peopleQuery.parse("  jane ")).toBe("jane");
    expect(peopleQuery.safeParse("x".repeat(PEOPLE_QUERY_MAX + 1)).success).toBe(false);
    expect(parsePeopleQuery(undefined)).toBe("");
    expect(parsePeopleQuery(["a", "b"])).toBe("");
    expect(parsePeopleQuery("x".repeat(PEOPLE_QUERY_MAX + 1))).toBe("");
  });
  it("escapes LIKE wildcards and the escape character", () => {
    expect(escapeLike("50%_off\\")).toBe("50\\%\\_off\\\\");
  });
  it("splits text around every case-insensitive match", () => {
    expect(highlightParts("Jane Jan", "jan")).toEqual([
      { text: "Jan", hit: true },
      { text: "e ", hit: false },
      { text: "Jan", hit: true },
    ]);
    expect(highlightParts("Jane", "")).toEqual([{ text: "Jane", hit: false }]);
  });
});
