import { describe, expect, it } from "vitest";
import { checkName, fullName, guessNames, posterFirstName, posterName } from "./person-name";

describe("checkName", () => {
  it("accepts ordinary names and tidies spaces", () => {
    expect(checkName("  Mary-Kate  O'Neil ", "first name")).toEqual({ ok: true, value: "Mary-Kate O'Neil" });
    expect(checkName("Zoë", "first name")).toEqual({ ok: true, value: "Zoë" });
  });
  it("takes a phone's curly apostrophe as a plain one, and periods after the first letter", () => {
    expect(checkName("O\u2019Brien", "last name")).toEqual({ ok: true, value: "O'Brien" });
    expect(checkName("D\u2019Angelo", "first name")).toEqual({ ok: true, value: "D'Angelo" });
    expect(checkName("St. John", "last name")).toEqual({ ok: true, value: "St. John" });
    expect(checkName("J.", "first name")).toEqual({ ok: true, value: "J." });
    expect(checkName(".J", "first name").ok).toBe(false);
  });
  it("refuses empty, long and non-name input", () => {
    expect(checkName("", "first name").ok).toBe(false);
    expect(checkName("a".repeat(41), "last name").ok).toBe(false);
    expect(checkName("Sam42", "first name").ok).toBe(false);
    expect(checkName("<b>x</b>", "first name").ok).toBe(false);
    expect(checkName(undefined, "first name").ok).toBe(false);
  });
});

describe("guessNames", () => {
  it("splits a full name, keeps a lone first name, and gives up on junk", () => {
    expect(guessNames("Samantha Rose")).toEqual({ first: "Samantha", last: "Rose" });
    expect(guessNames("Mary Anne Smith")).toEqual({ first: "Mary", last: "Anne Smith" });
    expect(guessNames("Sam")).toEqual({ first: "Sam", last: null });
    expect(guessNames("Sam R.")).toEqual({ first: "Sam", last: null });
    expect(guessNames("jsmith")).toEqual({ first: "jsmith", last: null });
    expect(guessNames("Room 4 @ King St")).toEqual({ first: "Room", last: null });
    expect(guessNames("")).toEqual({ first: null, last: null });
    expect(fullName("Sam", "Rose")).toBe("Sam Rose");
  });
});

describe("posterName", () => {
  const base = { firstName: null, lastName: null, legacyNames: [], email: "jsmith@uvm.edu", legacyNetid: "jsmith" };
  it("uses the account's first and last name", () => {
    expect(posterName({ ...base, firstName: "Jo", lastName: "Smith", legacyNames: ["Jo S."] })).toBe("Jo Smith");
  });
  it("falls back to the old name shown until the account has both", () => {
    expect(posterName({ ...base, firstName: "Jo", legacyNames: ["Jo S.", "jsmith"] })).toBe("Jo S.");
    expect(posterName({ ...base, legacyNames: ["", "Jordan Smith"] })).toBe("Jordan Smith");
  });
  it("never shows a NetID or the email's first part", () => {
    expect(posterName({ ...base, legacyNames: ["JSmith", "jsmith"] })).toBeNull();
    expect(posterName({ ...base, email: "aaron@catamountsublets.com", legacyNetid: "ap1", legacyNames: ["ap1", "aaron"] })).toBeNull();
    expect(posterFirstName({ ...base, firstName: "jsmith" })).toBeNull();
    expect(posterFirstName({ ...base, firstName: "Jo", lastName: "Smith" })).toBe("Jo");
    expect(posterFirstName({ ...base, legacyNames: ["Jordan Smith"] })).toBe("Jordan");
  });
  it("uses a saved first and last name even when the first matches the email", () => {
    expect(posterFirstName({ ...base, email: "sam@example.org", firstName: "Sam", lastName: "Rivera" })).toBe("Sam");
  });
});
