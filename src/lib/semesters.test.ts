import { describe, expect, it } from "vitest";
import {
  orderSemesterCodes,
  suggestedCode,
  semesterKey,
  semesterLabel,
  semesterParts,
  semestersBackToBack,
  sortSemesters,
} from "./semesters";

describe("semesterParts / semesterKey", () => {
  it("reads a term and a year anywhere in the name", () => {
    expect(semesterParts("Spring 2027")).toEqual({ year: 2027, termIndex: 0, term: "Spring" });
    expect(semesterParts("summer 2027 (early)")).toEqual({ year: 2027, termIndex: 1, term: "Summer" });
    expect(semesterParts("Winter break")).toBeNull();
    expect(semesterParts("")).toBeNull();
  });

  it("keys go up by one from each semester to the next, across the year boundary", () => {
    expect(semesterKey("Fall 2026")! + 1).toBe(semesterKey("Spring 2027"));
    expect(semesterKey("Spring 2027")! + 1).toBe(semesterKey("Summer 2027"));
    expect(semesterKey("Summer 2027")! + 1).toBe(semesterKey("Fall 2027"));
  });
});

describe("semestersBackToBack", () => {
  it("accepts one semester, or consecutive ones in any order", () => {
    expect(semestersBackToBack(["Spring 2027"])).toBe(true);
    expect(semestersBackToBack(["Fall 2027", "Summer 2027"])).toBe(true);
    expect(semestersBackToBack(["Fall 2026", "Spring 2027"])).toBe(true);
    expect(semestersBackToBack(["Spring 2027", "Summer 2027", "Fall 2027"])).toBe(true);
  });

  it("rejects gaps, duplicates and names that are not a term and year", () => {
    expect(semestersBackToBack(["Spring 2027", "Fall 2027"])).toBe(false);
    expect(semestersBackToBack(["Spring 2027", "Spring 2027"])).toBe(false);
    expect(semestersBackToBack(["Spring 2027", "Winter break"])).toBe(false);
    expect(semestersBackToBack(["Winter break"])).toBe(true);
  });
});

describe("sortSemesters", () => {
  it("orders by calendar, then unparsed names by sort order and name", () => {
    const rows = [
      { name: "Fall 2027", sortOrder: 1 },
      { name: "Zeta", sortOrder: 5 },
      { name: "Spring 2027", sortOrder: 9 },
      { name: "Alpha", sortOrder: 5 },
      { name: "Spring 2028", sortOrder: 0 },
    ];
    expect(sortSemesters(rows).map((r) => r.name)).toEqual([
      "Spring 2027",
      "Fall 2027",
      "Spring 2028",
      "Alpha",
      "Zeta",
    ]);
  });
});

describe("semesterLabel", () => {
  it("matches the legacy strings", () => {
    expect(semesterLabel(["Spring 2027"])).toBe("Spring 2027");
    expect(semesterLabel(["Summer 2027", "Fall 2027"])).toBe("Summer & Fall 2027");
    expect(semesterLabel(["Fall 2027", "Spring 2028"])).toBe("Fall 2027 & Spring 2028");
    expect(semesterLabel(["Spring 2027", "Summer 2027", "Fall 2027"])).toBe("Spring–Fall 2027");
    expect(semesterLabel(["Summer 2027", "Fall 2027", "Spring 2028"])).toBe("Summer 2027–Spring 2028");
    expect(semesterLabel(["Spring 2027", "Winter break"])).toBe("Spring 2027 & Winter break");
    expect(semesterLabel([])).toBe("");
    expect(semesterLabel(["", "Fall 2027"])).toBe("Fall 2027");
  });
});

describe("orderSemesterCodes", () => {
  it("numbers codes in calendar order", () => {
    expect(
      orderSemesterCodes([
        { code: "fall27", name: "Fall 2027" },
        { code: "summer27", name: "Summer 2027" },
      ]),
    ).toEqual([
      { code: "summer27", position: 0 },
      { code: "fall27", position: 1 },
    ]);
  });
});

describe("suggestedCode", () => {
  it("makes the admin form's code from a term and a year", () => {
    expect(suggestedCode("Fall 2028")).toBe("fall28");
    expect(suggestedCode("  summer 2030 ")).toBe("summer30");
    expect(suggestedCode("Winter break")).toBe("");
  });
});
