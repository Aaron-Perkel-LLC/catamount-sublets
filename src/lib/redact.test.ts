import { describe, expect, it } from "vitest";
import { REDACTED, redactForPublic } from "./redact";

const R = REDACTED;

describe("redactForPublic", () => {
  it.each([
    ["Sunny room at 62 King St, right by Church Street.", `Sunny room at ${R}, right by Church Street.`],
    ["We're at 12B N. Winooski Avenue, 2nd floor.", `We're at ${R}, 2nd floor.`],
    ["41-43 pearl street, apt 3", `${R}`],
    ["Text me at (802) 555-1234 or 802.555.9876!", `Text me at ${R} or ${R}!`],
    ["call 8025551234 anytime", `call ${R} anytime`],
    ["+1 802 555 1234", R],
    ["email sam.k@uvm.edu with questions", `email ${R} with questions`],
    ["reach me: sam at uvm dot edu", `reach me: ${R}`],
    ["sam(at)gmail(dot)com", R],
    ["DM @sam.kowalski on insta", `DM ${R} on insta`],
    ["ig: sam.k / snap - samk22", `${R}`],
    ["photos at https://www.zillow.com/homedetails/62-King-St", `photos at ${R}`],
    ["see maps.app.goo.gl/AbC123 for the spot", `see ${R} for the spot`],
    ["Unit 4, Apartment #2B, suite 10", `${R}`],
    ["We're #7 on the street", `We're ${R} on the street`],
    ["on the corner of Pearl and Union, 5 min walk", `on the ${R}, 5 min walk`],
  ])("redacts %j", (input, expected) => {
    expect(redactForPublic(input)).toBe(expected);
  });

  it.each([
    "2 king beds, 1.5 baths, $850/mo plus utilities",
    "5 min walk to campus, 10 min drive to the lake",
    "a 3 bedroom place with 2 roommates staying",
    "Available Jan 2027 - May 2027, rent $1,200 negotiable",
    "Close to UVM and Church St. Laundry in the basement.",
    "2 blocks from the bus stop; parking for 1 car",
    "Room is 12 x 14 ft, second floor, quiet at night. Laundry free.",
  ])("leaves %j alone", (input) => {
    expect(redactForPublic(input)).toBe(input);
  });

  it("redacts the listing's own street even without a house number", () => {
    expect(redactForPublic("Quiet stretch of King St near the lake.", "62 King St, Burlington, VT")).toBe(`Quiet stretch of ${R} near the lake.`);
    expect(redactForPublic("We're number 62, the blue one.", "62 King St, Burlington")).toBe(`We're ${R}, the blue one.`);
    // Another street is fine: it is not this listing's.
    expect(redactForPublic("Walk down Pearl Street to campus.", "62 King St, Burlington")).toBe("Walk down Pearl Street to campus.");
  });

  it("reads a realistic description", () => {
    const text = `Subletting my room at 214 S Willard St for spring! 2 bed / 1 bath, 8 min walk to Waterman.
Rent is $900 + ~$60 utilities. Text Jess at 802-555-0142 or email jess.t@uvm.edu, IG @jess.travels.`;
    const out = redactForPublic(text, "214 S Willard St, Burlington, VT 05401");
    for (const leak of ["214", "Willard", "555", "0142", "jess.t", "@jess.travels"]) expect(out).not.toContain(leak);
    for (const kept of ["2 bed / 1 bath", "8 min walk", "$900", "$60 utilities", "Text Jess"]) expect(out).toContain(kept);
  });
});
