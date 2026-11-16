// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db";

/**
 * /outcome in a browser (jsdom), the way a link scanner that runs JavaScript
 * (Microsoft Safe Links) or the poster sees it: the server page is mounted
 * with React's real client renderer, so every effect runs. Opening the link
 * must record nothing; only a click on the button records, once.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({ db: null as unknown as Db }));
vi.mock("@/db", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/db")>()), getDb: async () => h.db }));
// The real answer, against the test database, without next/headers.
vi.mock("@/server/actions/outcome", async () => {
  const { answerFromLink } = await import("@/server/services/listing-outcome");
  return { answerOutcomeAction: vi.fn((t: string, a: string) => answerFromLink(h.db, { t, a }, "203.0.113.9")) };
});

const { createTestDb } = await import("@/db/test-db");
const s = await import("@/db/schema");
const { eq } = await import("drizzle-orm");
const { default: OutcomePage } = await import("./page");
const { answerOutcomeAction } = await import("@/server/actions/outcome");
const { signOutcomeToken } = await import("@/server/outcome-token");
const { EMAIL_ANSWERS } = await import("@/lib/listing-outcome");

let close: () => Promise<void>;
let listingId: number;
let root: Root | null = null;

beforeAll(async () => {
  ({ db: h.db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(async () => {
  vi.mocked(answerOutcomeAction).mockClear();
  await h.db.delete(s.listingOutcomes);
  await h.db.delete(s.listings);
  await h.db.delete(s.user);
  await h.db.delete(s.rateLimitBuckets);
  const [u] = await h.db.insert(s.user).values({ email: "poster@uvm.edu", name: "poster" }).returning({ id: s.user.id });
  const [l] = await h.db.insert(s.listings).values({ userId: u.id, price: 650, address: "1 Main St, Burlington, Vermont", lat: 44.48, lon: -73.2 }).returning({ id: s.listings.id });
  listingId = l.id;
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

/** Opens /outcome?t=…&a=… : the server page, mounted in the document, with effects flushed. */
async function open(t: string, a: string) {
  const tree = await OutcomePage({ searchParams: Promise.resolve({ t, a }) });
  const container = document.body.appendChild(document.createElement("div"));
  root = createRoot(container);
  await act(async () => root!.render(tree));
  // Give anything started on load (a transition, a fetch) time to land.
  await act(() => new Promise((r) => setTimeout(r, 50)));
  return container;
}

const button = (c: HTMLElement, label: string) => [...c.querySelectorAll("button")].find((b) => b.textContent === label)!;
const outcomes = () => h.db.select().from(s.listingOutcomes);
const status = async () => (await h.db.select({ status: s.listings.status }).from(s.listings).where(eq(s.listings.id, listingId)))[0].status;

describe("/outcome in a browser", () => {
  it("records nothing when opened with ?a=through_site; one click records it once", async () => {
    const t = signOutcomeToken(listingId);
    const page = await open(t, "through_site");

    expect(answerOutcomeAction).not.toHaveBeenCalled();
    expect(await outcomes()).toHaveLength(0);
    expect(await status()).toBe("open");
    expect(page.querySelector('[role="status"]')?.textContent).toContain(`Tap “${EMAIL_ANSWERS.through_site}” to confirm.`);
    const filled = button(page, EMAIL_ANSWERS.through_site);
    expect(filled.className).toBe("btn-primary");
    expect(filled.getAttribute("aria-pressed")).toBe("false");

    await act(async () => filled.click());
    await act(() => new Promise((r) => setTimeout(r, 50)));

    expect(answerOutcomeAction).toHaveBeenCalledTimes(1);
    expect(answerOutcomeAction).toHaveBeenCalledWith(t, "through_site");
    expect((await outcomes()).map((o) => [o.listingId, o.outcome])).toEqual([[listingId, "through_site"]]);
    expect(await status()).toBe("taken");
    expect(page.querySelector('[role="status"]')?.textContent).toContain(`Recorded: ${EMAIL_ANSWERS.through_site}.`);
    expect(button(page, EMAIL_ANSWERS.through_site).getAttribute("aria-pressed")).toBe("true");
  });
});
