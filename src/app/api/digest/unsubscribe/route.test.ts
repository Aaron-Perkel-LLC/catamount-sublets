import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db";

/**
 * RFC 8058: the mail provider POSTs `List-Unsubscribe=One-Click` to the
 * header's URL, and that POST unsubscribes. A GET (a link scanner such as
 * Safe Links, or a person pasting the URL) must change nothing; it is
 * redirected to the confirm page, and opening that page changes nothing
 * either.
 */
const h = vi.hoisted(() => ({ db: null as unknown as Db }));
vi.mock("@/db", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/db")>()), getDb: async () => h.db }));

const { createTestDb } = await import("@/db/test-db");
const s = await import("@/db/schema");
const { digestSubscriptionFor, savedSearchesFor } = await import("@/server/data/digest");
const { signDigestUnsubscribe } = await import("@/server/digest-token");
const { GET, POST } = await import("./route");
const { default: UnsubscribePage } = await import("@/app/unsubscribe/page");
const { GET: cronGET } = await import("@/app/api/cron/digest/route");

let close: () => Promise<void>;
let me: string;

beforeAll(async () => {
  ({ db: h.db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(async () => {
  await h.db.delete(s.user);
  const [u] = await h.db.insert(s.user).values({ email: "me@uvm.edu", name: "me" }).returning({ id: s.user.id });
  me = u.id;
  await h.db.insert(s.digestSubscriptions).values({ userId: me, enabled: true, enabledAt: new Date() });
  await h.db.insert(s.savedSearches).values({ userId: me, name: "All", query: "" });
});

const url = (t: string) => `http://localhost:3000/api/digest/unsubscribe?t=${encodeURIComponent(t)}`;
const oneClick = (t: string) =>
  new Request(url(t), { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "List-Unsubscribe=One-Click" });

describe("one-click unsubscribe", () => {
  it("unsubscribes on the RFC 8058 POST, from another origin, and keeps the saved searches", async () => {
    const res = await POST(oneClick(signDigestUnsubscribe(me)));
    expect(res.status).toBe(200);
    expect((await digestSubscriptionFor(h.db, me)).enabled).toBe(false);
    expect(await savedSearchesFor(h.db, me)).toHaveLength(1);
  });

  it("refuses a bad token and changes nothing", async () => {
    const res = await POST(oneClick("forged.1.2"));
    expect(res.status).toBe(400);
    expect((await digestSubscriptionFor(h.db, me)).enabled).toBe(true);
  });

  it("changes nothing on GET, and sends it to the confirm page", async () => {
    const t = signDigestUnsubscribe(me);
    const res = await GET(new Request(url(t)));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toMatch(/\/unsubscribe\?t=/);
    expect((await digestSubscriptionFor(h.db, me)).enabled).toBe(true);
  });

  it("the confirm page changes nothing when it is opened", async () => {
    await UnsubscribePage({ searchParams: Promise.resolve({ t: signDigestUnsubscribe(me) }) });
    expect((await digestSubscriptionFor(h.db, me)).enabled).toBe(true);
  });
});

describe("digest cron route", () => {
  it("refuses a call without the cron secret", async () => {
    process.env.CRON_SECRET = "a-test-cron-secret-0123456789";
    expect((await cronGET(new Request("http://localhost/api/cron/digest"))).status).toBe(401);
    expect((await cronGET(new Request("http://localhost/api/cron/digest", { headers: { authorization: "Bearer wrong" } }))).status).toBe(401);
  });

  it("does nothing while the switch is off", async () => {
    process.env.CRON_SECRET = "a-test-cron-secret-0123456789";
    const res = await cronGET(new Request("http://localhost/api/cron/digest", { headers: { authorization: "Bearer a-test-cron-secret-0123456789" } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ acted: false, reason: "switched_off", sent: 0 });
    delete process.env.CRON_SECRET;
  });
});
