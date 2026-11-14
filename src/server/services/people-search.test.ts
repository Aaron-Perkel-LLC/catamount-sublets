import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/db/test-db";
import * as s from "@/db/schema";
import { searchPeopleIds } from "./admin";

type Db = Awaited<ReturnType<typeof createTestDb>>["db"];
let db: Db;
let close: () => Promise<void>;
const ids: Record<string, string> = {};

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  for (const [key, email, firstName, lastName, legacyNetid] of [
    ["jane", "jdoe@uvm.edu", "Jane", "Doe", "jdoe"],
    ["janet", "jsmith2@uvm.edu", "Janet", "Smith", null],
    ["pct", "x100_pct@uvm.edu", "Percy", "O'Hara", null],
    ["noname", "zz9@uvm.edu", null, null, null],
  ] as const) {
    const [u] = await db
      .insert(s.user)
      .values({ email, name: firstName ? `${firstName} ${lastName}` : email.split("@")[0], firstName, lastName, legacyNetid })
      .returning({ id: s.user.id });
    ids[key] = u.id;
  }
});
afterAll(() => close());

const find = async (q: string) => (await searchPeopleIds(db, q)).sort();
const of = (...keys: string[]) => keys.map((k) => ids[k]).sort();

describe("searchPeopleIds", () => {
  it("matches first names, case-insensitively and in part", async () => {
    expect(await find("JAN")).toEqual(of("jane", "janet"));
    expect(await find("janet")).toEqual(of("janet"));
  });
  it("matches last names", async () => {
    expect(await find("smi")).toEqual(of("janet"));
    expect(await find("o'hara")).toEqual(of("pct"));
  });
  it("matches the full name across the space", async () => {
    expect(await find("jane doe")).toEqual(of("jane"));
    expect(await find("e d")).toEqual(of("jane"));
  });
  it("matches the email and the NetID", async () => {
    expect(await find("zz9@")).toEqual(of("noname"));
    expect(await find("jdoe")).toEqual(of("jane"));
  });
  it("matches the user id", async () => {
    expect(await find(ids.janet.slice(0, 13))).toEqual(of("janet"));
  });
  it("treats % and _ literally", async () => {
    expect(await find("%")).toEqual([]);
    expect(await find("_")).toEqual(of("pct"));
    expect(await find("x100_")).toEqual(of("pct"));
    expect(await find("j_oe")).toEqual([]);
    expect(await find("\\")).toEqual([]);
  });
  it("returns everyone for an empty query", async () => {
    expect(await find("")).toEqual(of("jane", "janet", "pct", "noname"));
  });
});
