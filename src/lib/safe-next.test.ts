import { expect, it } from "vitest";
import { safeNext } from "./safe-next";

it("keeps site paths and refuses anything that could leave the site", () => {
  expect(safeNext("/browse?id=187&via=share")).toBe("/browse?id=187&via=share");
  expect(safeNext("/listing/3")).toBe("/listing/3");
  expect(safeNext(null)).toBe("/browse");
  expect(safeNext("")).toBe("/browse");
  expect(safeNext("https://evil.example")).toBe("/browse");
  expect(safeNext("//evil.example")).toBe("/browse");
  expect(safeNext("/\\evil.example")).toBe("/browse");
  expect(safeNext("javascript:alert(1)")).toBe("/browse");
  expect(safeNext("/a\nb")).toBe("/browse");
  expect(safeNext(undefined, "/map")).toBe("/map");
});
