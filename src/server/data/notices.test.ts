import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import * as s from "@/db/schema";
import { createTestDb } from "@/db/test-db";
import { easternDate, nextDate } from "@/lib/dates";
import { noticeInput, type NoticeInput, type NoticeViewer } from "@/lib/notices";
import {
  createNotice,
  deleteNotice,
  dismissNotice,
  duplicateNotice,
  endsAtFor,
  listNoticesForAdmin,
  noticeFor,
  recordNoticeEvent,
  setNoticeActive,
  updateNotice,
} from "./notices";

let db: Db;
let close: () => Promise<void>;
const ids = { student: "", poster: "", admin: "" };
const out: NoticeViewer = { kind: "signed-out" };
let student: NoticeViewer;
let poster: NoticeViewer;
const actor = (id: string, hasListing: boolean, role: "user" | "admin" = "user") => ({ kind: "signed-in" as const, userId: id, role, hasListing });
const anon = (k: string) => ({ kind: "signed-out" as const, anonKey: k.padEnd(16, "0") });

const values = (patch: Partial<NoticeInput> = {}) => noticeInput.parse({ title: "Heads up", bodyMd: "Body", audience: "everyone", ctaLabel: "", ctaHref: "", endsOn: "", ...patch });
async function live(patch: Partial<NoticeInput> = {}) {
  const id = await createNotice(db, values(patch), ids.admin);
  await setNoticeActive(db, id, true, ids.admin);
  return id;
}

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  const mk = async (email: string, role = "user") => (await db.insert(s.user).values({ email, name: email, role }).returning({ id: s.user.id }))[0].id;
  ids.student = await mk("student@uvm.edu");
  ids.poster = await mk("poster@uvm.edu");
  ids.admin = await mk("admin@example.com", "admin");
  await db.insert(s.listings).values({ userId: ids.poster, price: 900, address: "x", lat: 44.47, lon: -73.2 });
  student = { kind: "signed-in", userId: ids.student, hasListing: false };
  poster = { kind: "signed-in", userId: ids.poster, hasListing: true };
});
afterAll(async () => {
  await close();
});
beforeEach(async () => {
  await db.delete(s.siteNotices);
});

describe("noticeFor", () => {
  it("nothing when nothing is active, and an inactive notice never goes out", async () => {
    await createNotice(db, values(), ids.admin);
    for (const v of [out, student, poster]) expect(await noticeFor(db, v)).toBeNull();
  });

  it("each audience reaches exactly its people", async () => {
    const id = await live({ audience: "everyone" });
    expect((await Promise.all([out, student, poster].map((v) => noticeFor(db, v)))).map((n) => n?.id ?? null)).toEqual([id, id, id]);

    await updateNotice(db, id, values({ audience: "signed_in" }), ids.admin);
    expect((await Promise.all([out, student, poster].map((v) => noticeFor(db, v)))).map((n) => n?.id ?? null)).toEqual([null, id, id]);

    await updateNotice(db, id, values({ audience: "posters" }), ids.admin);
    expect((await Promise.all([out, student, poster].map((v) => noticeFor(db, v)))).map((n) => n?.id ?? null)).toEqual([null, null, id]);
  });

  it("sends the body and button, never the audience or who wrote it", async () => {
    await live({ bodyMd: "**Hi**", ctaLabel: "Go", ctaHref: "/post" });
    expect(Object.keys((await noticeFor(db, out))!).sort()).toEqual(["bodyMd", "ctaHref", "ctaLabel", "id", "title"]);
  });

  it("stops at the end of its last Eastern day", async () => {
    const id = await live({ endsOn: easternDate(new Date()) });
    expect(await noticeFor(db, out)).not.toBeNull();
    await db.update(s.siteNotices).set({ endsAt: new Date(Date.now() - 1000) }).where(eq(s.siteNotices.id, id));
    expect(await noticeFor(db, out)).toBeNull();
    expect(endsAtFor("2026-11-20")?.toISOString()).toBe("2026-11-21T05:00:00.000Z"); // EST: midnight starting Nov 21
    expect(endsAtFor("2026-07-04")?.toISOString()).toBe("2026-07-05T04:00:00.000Z"); // EDT
    expect(nextDate("2026-11-20")).toBe("2026-11-21");
  });

  it("a dismissal stops it for that person only; editing doesn't bring it back; a duplicate does", async () => {
    const id = await live({ audience: "signed_in" });
    expect(await dismissNotice(db, actor(ids.student, false), id, "dismiss")).toBe("dismissed");
    expect(await noticeFor(db, student)).toBeNull();
    expect((await noticeFor(db, poster))?.id).toBe(id);

    await updateNotice(db, id, values({ audience: "signed_in", title: "Heads up (fixed)" }), ids.admin);
    expect(await noticeFor(db, student)).toBeNull();

    const copy = (await duplicateNotice(db, id, ids.admin))!;
    expect(copy).not.toBe(id);
    expect(await noticeFor(db, student)).toBeNull(); // the copy starts inactive
    await setNoticeActive(db, copy, true, ids.admin);
    expect((await noticeFor(db, student))?.id).toBe(copy);
    expect((await noticeFor(db, student))?.title).toBe("Heads up (fixed)");
  });
});

describe("one active notice", () => {
  it("activating one deactivates the other, in one go", async () => {
    const a = await live();
    const b = await live();
    const rows = await db.select({ id: s.siteNotices.id, active: s.siteNotices.active }).from(s.siteNotices).orderBy(s.siteNotices.id);
    expect(rows).toEqual([
      { id: a, active: false },
      { id: b, active: true },
    ]);
  });

  it("the database refuses a second active notice however it is written", async () => {
    await live();
    await expect(db.insert(s.siteNotices).values({ title: "x", bodyMd: "", audience: "everyone", active: true })).rejects.toThrow();
  });

  it("activating a notice that's gone changes nothing", async () => {
    const a = await live();
    expect(await setNoticeActive(db, a + 999, true, ids.admin)).toBe("missing");
    expect((await noticeFor(db, out))?.id).toBe(a);
  });

  it("a notice past its last day can't be activated, and trying leaves the live one live", async () => {
    const a = await live();
    const old = await createNotice(db, values(), ids.admin);
    await db.update(s.siteNotices).set({ endsAt: new Date(Date.now() - 1000) }).where(eq(s.siteNotices.id, old));
    expect(await setNoticeActive(db, old, true, ids.admin)).toBe("missing");
    expect((await noticeFor(db, out))?.id).toBe(a);
    expect(await setNoticeActive(db, a, false, ids.admin)).toBe("ok");
    expect(await noticeFor(db, out)).toBeNull();
  });

  it("the database only takes a CTA link to a path here or an https page", async () => {
    const insert = (ctaHref: string) => db.insert(s.siteNotices).values({ title: "x", bodyMd: "", audience: "everyone", ctaLabel: "Go", ctaHref });
    for (const ok of ["/post", "/", "/account#alerts", "https://example.com"]) await expect(insert(ok)).resolves.toBeDefined();
    for (const bad of ["javascript:alert(1)", "//evil.example", "/\\evil.example", "http://example.com", "data:text/html,x", "mailto:a@example.com", "post"]) {
      await expect(insert(bad)).rejects.toThrow();
    }
  });

  it("a stored CTA that fails the full rule never goes out (the button is dropped, the notice still shows)", async () => {
    const id = await createNotice(db, values(), ids.admin);
    await db.update(s.siteNotices).set({ ctaLabel: "Go", ctaHref: "https://ok.example/\tx" }).where(eq(s.siteNotices.id, id));
    await setNoticeActive(db, id, true, ids.admin);
    const n = await noticeFor(db, out);
    expect(n?.id).toBe(id);
    expect([n?.ctaLabel, n?.ctaHref]).toEqual([null, null]);
  });

  it("the database holds the CTA both-or-neither and the lengths too", async () => {
    await expect(db.insert(s.siteNotices).values({ title: "x", bodyMd: "", audience: "everyone", ctaLabel: "Go" })).rejects.toThrow();
    await expect(db.insert(s.siteNotices).values({ title: "", bodyMd: "", audience: "everyone" })).rejects.toThrow();
    await expect(db.insert(s.siteNotices).values({ title: "x", bodyMd: "", audience: "admins" })).rejects.toThrow();
  });
});

describe("recordNoticeEvent", () => {
  it("counts once per notice, type and person", async () => {
    const id = await live();
    expect(await recordNoticeEvent(db, actor(ids.student, false), id, "view")).toBe("stored");
    expect(await recordNoticeEvent(db, actor(ids.student, false), id, "view")).toBe("duplicate");
    expect(await recordNoticeEvent(db, anon("a1"), id, "view")).toBe("stored");
    expect(await recordNoticeEvent(db, anon("a1"), id, "dismiss")).toBe("stored");
    expect(await recordNoticeEvent(db, anon("a2"), id, "cta")).toBe("invalid"); // no view from a2 yet
    expect(await recordNoticeEvent(db, anon("a2"), id, "view")).toBe("stored");
    expect(await recordNoticeEvent(db, anon("a2"), id, "cta")).toBe("stored");
    expect(await recordNoticeEvent(db, anon("a2"), id, "teleport")).toBe("invalid");
    const [row] = await listNoticesForAdmin(db);
    expect([row.views, row.dismissals, row.ctaClicks]).toEqual([3, 1, 1]);
  });

  it("a signed-out request can't count a notice for signed-in people, and nobody can count one outside their audience", async () => {
    const id = await live({ audience: "posters" });
    expect(await recordNoticeEvent(db, anon("a3"), id, "view")).toBe("invalid");
    expect(await recordNoticeEvent(db, actor(ids.student, false), id, "view")).toBe("invalid");
    expect(await recordNoticeEvent(db, actor(ids.poster, true), id, "view")).toBe("stored");
  });

  it("an inactive or deleted notice counts nothing, and admins are not counted", async () => {
    const id = await createNotice(db, values(), ids.admin);
    expect(await recordNoticeEvent(db, anon("a4"), id, "view")).toBe("invalid");
    await setNoticeActive(db, id, true, ids.admin);
    expect(await recordNoticeEvent(db, actor(ids.admin, false, "admin"), id, "view")).toBe("excluded");
    expect(await recordNoticeEvent(db, anon("a4"), 424242, "view")).toBe("invalid");
  });

  it("stores ids and keys only", async () => {
    const id = await live();
    await recordNoticeEvent(db, actor(ids.student, false), id, "view");
    const cols = (await db.execute(sql`select column_name from information_schema.columns where table_name = 'notice_events' order by ordinal_position`)) as unknown as { rows: { column_name: string }[] };
    expect(cols.rows.map((c) => c.column_name)).toEqual(["id", "notice_id", "type", "actor_key", "signed_out", "created_at"]);
    const [e] = await db.select().from(s.noticeEvents);
    expect(e.actorKey).toMatch(/^[0-9a-f]{16}$/);
    expect(e.actorKey).not.toContain(ids.student.slice(0, 8));
  });
});

describe("dismissNotice and deleteNotice", () => {
  it("a dismissal counts as a dismissal or a CTA click, once", async () => {
    const id = await live();
    await dismissNotice(db, actor(ids.student, false), id, "cta");
    await dismissNotice(db, actor(ids.student, false), id, "cta");
    const [row] = await listNoticesForAdmin(db);
    expect([row.dismissals, row.ctaClicks]).toEqual([0, 1]);
    expect(await dismissNotice(db, actor(ids.student, false), 424242, "dismiss")).toBe("invalid");
  });

  it("delete takes its dismissals and counts with it", async () => {
    const id = await live();
    await dismissNotice(db, actor(ids.student, false), id, "dismiss");
    expect(await deleteNotice(db, id)).toBe(true);
    expect(await db.select().from(s.noticeDismissals)).toEqual([]);
    expect(await db.select().from(s.noticeEvents)).toEqual([]);
    expect(await deleteNotice(db, id)).toBe(false);
  });

  it("a duplicate drops an end date that has passed", async () => {
    const id = await live({ endsOn: easternDate(new Date()) });
    await db.update(s.siteNotices).set({ endsAt: new Date(Date.now() - 1000) }).where(eq(s.siteNotices.id, id));
    const copy = (await duplicateNotice(db, id, ids.admin))!;
    const [row] = await db.select({ endsAt: s.siteNotices.endsAt }).from(s.siteNotices).where(eq(s.siteNotices.id, copy));
    expect(row.endsAt).toBeNull();
    const rows = await listNoticesForAdmin(db);
    expect(rows.find((r) => r.id === id)?.ended).toBe(true);
  });
});
