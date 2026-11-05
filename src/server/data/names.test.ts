import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/db/test-db";
import * as s from "@/db/schema";
import { getNames, setNames } from "./names";

type Db = Awaited<ReturnType<typeof createTestDb>>["db"];
let db: Db;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());

describe("names", () => {
  it("is incomplete until both are set, prefills from a legacy full name, never from the email", async () => {
    const [legacy] = await db.insert(s.user).values({ email: "jsmith@uvm.edu", name: "Samantha Rose" }).returning({ id: s.user.id });
    const [fresh] = await db.insert(s.user).values({ email: "newkid@uvm.edu", name: "newkid" }).returning({ id: s.user.id });
    expect(await getNames(db, legacy.id)).toMatchObject({ complete: false, prefill: { first: "Samantha", last: "Rose" } });
    expect(await getNames(db, fresh.id)).toMatchObject({ complete: false, prefill: { first: "", last: "" } });

    await setNames(db, fresh.id, "Jordan", "Nguyen");
    expect(await getNames(db, fresh.id)).toMatchObject({ complete: true, first: "Jordan", last: "Nguyen" });
    const [row] = await db.select({ name: s.user.name }).from(s.user).where((await import("drizzle-orm")).eq(s.user.id, fresh.id));
    expect(row.name).toBe("Jordan Nguyen");
  });

  it("never prefills a NetID, whether stored by the import or guessed", async () => {
    // The import stored the old "name shown" as a first name, and some of those were the NetID itself.
    const [stored] = await db
      .insert(s.user)
      .values({ email: "kwalsh@uvm.edu", name: "kwalsh", legacyNetid: "kwalsh", firstName: "Kwalsh" })
      .returning({ id: s.user.id });
    const [aliased] = await db.insert(s.user).values({ email: "admin@example.org", name: "ab12cd", legacyNetid: "ab12cd" }).returning({ id: s.user.id });
    expect(await getNames(db, stored.id)).toMatchObject({ complete: false, prefill: { first: "", last: "" } });
    expect(await getNames(db, aliased.id)).toMatchObject({ prefill: { first: "", last: "" } });
  });

  it("shows a saved first name even when it matches the email", async () => {
    const [sam] = await db.insert(s.user).values({ email: "sam@example.org", name: "Sam Rivera", firstName: "Sam", lastName: "Rivera" }).returning({ id: s.user.id });
    expect(await getNames(db, sam.id)).toMatchObject({ complete: true, prefill: { first: "Sam", last: "Rivera" } });
  });
});
