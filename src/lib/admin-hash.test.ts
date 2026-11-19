import { describe, expect, it } from "vitest";
import { legacyAdminTarget } from "./admin-hash";

const UID = "0b9f3c2e-4d4a-4c5e-9a8b-1c2d3e4f5a6b";

describe("legacyAdminTarget", () => {
  it.each([
    ["#post:187", "/admin/listings#post:187"],
    ["post:42", "/admin/listings#post:42"],
    ["#post", "/admin/listings"],
    ["#post:abc", "/admin/listings"],
    ["#people", "/admin/people"],
    [`#people:${UID}`, `/admin/people#people:${UID}`],
    ["#people:<script>", "/admin/people"],
    ["#posts", "/admin/people"],
    ["#requests", "/admin/requests"],
    ["#mail", "/admin/mail"],
    ["#email", "/admin/announce"],
    ["#announcement", "/admin/announce"],
    ["#announce", "/admin/announce"],
    ["#digest", "/admin/digest"],
    ["#survey", "/admin/survey"],
    ["#semesters", "/admin/semesters"],
    ["#images", "/admin/photos"],
    ["#images:187", "/admin/photos#images:187"],
  ])("%s → %s", (hash, target) => {
    expect(legacyAdminTarget(hash)).toBe(target);
  });

  it("keeps the Overview for #activity, nothing and anything unknown", () => {
    for (const h of ["#activity", "", "#", "#nope", "#messages:1"]) expect(legacyAdminTarget(h)).toBeNull();
  });

  it("never builds a URL off the admin", () => {
    for (const h of ["#post://evil.example", "#images:../../x", "#people:javascript:alert(1)"]) {
      const t = legacyAdminTarget(h);
      expect(t === null || t.startsWith("/admin")).toBe(true);
      expect(t ?? "").not.toMatch(/evil|\.\.|javascript/);
    }
  });
});
