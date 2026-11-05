import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "./csv";

describe("csv", () => {
  it("quotes commas, quotes and newlines, and leaves plain cells alone", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell("a, b")).toBe('"a, b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
  });

  it("disarms formulas", () => {
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("-x")).toBe("'-x");
    expect(csvCell("@me")).toBe("'@me");
    expect(csvCell("=1,2")).toBe("\"'=1,2\"");
  });

  it("prints numbers, booleans and blanks", () => {
    expect(toCsv([["id", "ok", "note"], [1, true, null], [2, false, undefined]])).toBe("id,ok,note\r\n1,true,\r\n2,false,\r\n");
  });
});
