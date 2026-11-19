import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db";

/**
 * RFC 8058 for the admin's group email: the mail provider POSTs
 * `List-Unsubscribe=One-Click` to the header's URL, and that POST marks the
 * account Stop email. A GET (a link scanner, or a person pasting the URL)
 * must change nothing; it is redirected to the confirm page, and opening
 * that page changes nothing either. The email cron needs its secret.
 */
const h = vi.hoisted(() => ({ db: null as unknown as Db }));
vi.mock("@/db", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/db")>()), getDb: async () => h.db }));

const { createTestDb } = await import("@/db/test-db");
const s = await import("@/db/schema");
const { eq } = await import("drizzle-orm");
const { signAnnounceUnsubscribe } = await import("@/server/email-token");
const { GET, POST } = await import("./route");
const { default: UnsubscribePage } = await import("@/app/unsubscribe/page");
const { GET: cronGET } = await import("@/app/api/cron/email/route");

let close: () => Promise<void>;
let me: string;
const stopped = async () => (await h.db.select({ noEmail: s.user.noEmail, source: s.user.noEmailSource }).from(s.user).where(eq(s.user.id, me)))[0];

beforeAll(async () => {
  ({ db: h.db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(async () => {
  await h.db.delete(s.user);
  const [u] = await h.db.insert(s.user).values({ email: "me@uvm.edu", name: "me" }).returning({ id: s.user.id });
  me = u.id;
});

const url = (t: string) => `http://localhost:3000/api/email/unsubscribe?t=${encodeURIComponent(t)}`;
const oneClick = (t: string) => new Request(url(t), { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "List-Unsubscribe=One-Click" });

describe("/api/email/unsubscribe", () => {
  it("a one-click POST with a good token marks the account Stop email, and says so in plain text", async () => {
    const res = await POST(oneClick(signAnnounceUnsubscribe(me)));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("Unsubscribed from announcements.");
    expect(await stopped()).toEqual({ noEmail: true, source: "unsubscribe" });
    // Again is the same answer.
    expect((await POST(oneClick(signAnnounceUnsubscribe(me)))).status).toBe(200);
  });

  it("refuses a bad token and changes nothing", async () => {
    const res = await POST(oneClick("not-a-token"));
    expect(res.status).toBe(400);
    expect(await stopped()).toEqual({ noEmail: false, source: null });
  });

  it("a GET changes nothing and goes to the confirm page, which changes nothing either", async () => {
    const token = signAnnounceUnsubscribe(me);
    const res = await GET(new Request(url(token)));
    expect(res.status).toBe(303);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/unsubscribe");
    expect(new URL(res.headers.get("location")!).searchParams.get("t")).toBe(token);
    await UnsubscribePage({ searchParams: Promise.resolve({ t: token }) });
    expect(await stopped()).toEqual({ noEmail: false, source: null });
  });
});

describe("/api/cron/email", () => {
  it("needs the cron secret, and with nothing sending does nothing", async () => {
    vi.stubEnv("CRON_SECRET", "x".repeat(16));
    try {
      expect((await cronGET(new Request("http://localhost:3000/api/cron/email"))).status).toBe(401);
      expect((await cronGET(new Request("http://localhost:3000/api/cron/email", { headers: { authorization: "Bearer wrong" } }))).status).toBe(401);
      const res = await cronGET(new Request("http://localhost:3000/api/cron/email", { headers: { authorization: `Bearer ${"x".repeat(16)}` } }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ emails: 0, requeued: 0, sent: 0, failed: 0, acted: false });
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
