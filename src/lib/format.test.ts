import { describe, expect, it } from "vitest";
import { formatAddress, formatBytes, formatMoney, listingMapLinks, shortAddressFromDetails } from "./format";

describe("formatAddress", () => {
  it("drops the administrative tail and joins a bare house number", () => {
    expect(formatAddress("62, King Street, Downtown, Burlington, Chittenden County, Vermont, 05401, United States")).toBe(
      "62 King Street, Downtown, Burlington",
    );
    expect(formatAddress("118 Colchester Avenue, Burlington, VT, 05401, USA")).toBe("118 Colchester Avenue, Burlington");
    expect(formatAddress("County Road, Winooski, Vermont")).toBe("County Road, Winooski");
    expect(formatAddress("  ")).toBe("");
    expect(formatAddress("Vermont")).toBe("Vermont");
  });
});

describe("shortAddressFromDetails", () => {
  it("assembles from fields, falling back to the display name", () => {
    expect(
      shortAddressFromDetails("x", { house_number: "62", road: "King Street", neighbourhood: "Downtown", city: "Burlington" }),
    ).toBe("62 King Street, Downtown, Burlington");
    expect(shortAddressFromDetails("x", { road: "Main Street", town: "Winooski", suburb: "Winooski" })).toBe(
      "Main Street, Winooski",
    );
    expect(shortAddressFromDetails("University of Vermont, Burlington, Vermont, United States", {})).toBe(
      "University of Vermont, Burlington",
    );
  });
});

describe("listingMapLinks", () => {
  it("adds VT when no state is named and the point is in Vermont", () => {
    const links = listingMapLinks("62 King Street, Burlington", 44.4762, -73.2106);
    expect(links.google).toContain(encodeURIComponent("62 King Street, Burlington, VT"));
    expect(links.apple).toContain("ll=44.4762,-73.2106");
  });
  it("leaves an address that already names a state alone", () => {
    const links = listingMapLinks("1 Main St, Plattsburgh, New York", 44.69, -73.45);
    expect(links.google).not.toContain("VT");
  });
});

it("formatMoney and formatBytes", () => {
  expect(formatMoney(1200)).toBe("$1,200");
  expect(formatMoney(850.5)).toBe("$851");
  expect(formatBytes(820 * 1024)).toBe("820 KB");
  expect(formatBytes(12.4 * 1024 * 1024)).toBe("12 MB");
  expect(formatBytes(1.2 * 1024 ** 3)).toBe("1.2 GB");
});
