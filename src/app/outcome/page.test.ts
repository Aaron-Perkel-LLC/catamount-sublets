import { type ReactElement, type ReactNode, isValidElement } from "react";
import { renderToString } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db";

/**
 * Opening /outcome from the email must record nothing, even where a link
 * scanner runs the page's JavaScript (Microsoft Safe Links does). There is no
 * DOM in these tests, so OutcomeAnswer's hooks are stand-ins: effects run at
 * once, as they would in a browser after load, and a transition runs its
 * callback. Anything the component posted on arrival would therefore be posted
 * here; only an explicit button click may call the action.
 */
const h = vi.hoisted(() => ({ db: null as unknown as Db, transitions: [] as Promise<unknown>[] }));

vi.mock("react", async (importOriginal) => {
  const real = await importOriginal<typeof import("react")>();
  const runNow = (fn: () => unknown) => {
    fn();
  };
  return {
    ...real,
    useEffect: runNow,
    useLayoutEffect: runNow,
    useInsertionEffect: runNow,
    useState: <T,>(init: T | (() => T)) => [typeof init === "function" ? (init as () => T)() : init, () => {}],
    useTransition: () => [false, (fn: () => Promise<unknown> | void) => void h.transitions.push(Promise.resolve(fn()))],
  };
});
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
const { OutcomeAnswer } = await import("@/components/OutcomeAnswer");
const { answerOutcomeAction } = await import("@/server/actions/outcome");
const { signOutcomeToken } = await import("@/server/outcome-token");
const { EMAIL_ANSWERS } = await import("@/lib/listing-outcome");

let close: () => Promise<void>;
let listingId: number;

beforeAll(async () => {
  ({ db: h.db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(async () => {
  vi.mocked(answerOutcomeAction).mockClear();
  h.transitions.length = 0;
  await h.db.delete(s.listingOutcomes);
  await h.db.delete(s.listings);
  await h.db.delete(s.user);
  await h.db.delete(s.rateLimitBuckets);
  const [u] = await h.db.insert(s.user).values({ email: "poster@uvm.edu", name: "poster" }).returning({ id: s.user.id });
  const [l] = await h.db.insert(s.listings).values({ userId: u.id, price: 650, address: "1 Main St, Burlington, Vermont", lat: 44.48, lon: -73.2 }).returning({ id: s.listings.id });
  listingId = l.id;
});

async function openPage(t: string, a: string) {
  const tree = await OutcomePage({ searchParams: Promise.resolve({ t, a }) });
  const html = renderToString(tree).replaceAll("<!-- -->", "");
  await Promise.all(h.transitions);
  return { tree, html };
}

/** The OutcomeAnswer element the page rendered, with its props. */
function findAnswer(node: ReactNode): ReactElement<Parameters<typeof OutcomeAnswer>[0]> | null {
  if (!isValidElement(node)) return Array.isArray(node) ? (node.map(findAnswer).find(Boolean) ?? null) : null;
  if (node.type === OutcomeAnswer) return node as ReactElement<Parameters<typeof OutcomeAnswer>[0]>;
  return findAnswer((node.props as { children?: ReactNode }).children);
}

function buttons(node: ReactNode): ReactElement<{ children: ReactNode; onClick: () => void; className: string }>[] {
  if (Array.isArray(node)) return node.flatMap(buttons);
  if (!isValidElement(node)) return [];
  if (node.type === "button") return [node as ReactElement<{ children: ReactNode; onClick: () => void; className: string }>];
  return buttons((node.props as { children?: ReactNode }).children);
}

const outcomes = () => h.db.select().from(s.listingOutcomes);
const status = async () => (await h.db.select({ status: s.listings.status }).from(s.listings).where(eq(s.listings.id, listingId)))[0].status;

describe("/outcome", () => {
  it("records nothing when opened with a valid token and ?a=, and asks for a tap to confirm", async () => {
    const { html } = await openPage(signOutcomeToken(listingId), "through_site");
    expect(answerOutcomeAction).not.toHaveBeenCalled();
    expect(await outcomes()).toHaveLength(0);
    expect(await status()).toBe("open");
    expect(html).toContain(`Tap “${EMAIL_ANSWERS.through_site}” to confirm.`);
    expect(html).toContain("Nothing is recorded until you do.");
  });

  it("records once, and acts on the listing, when the button is clicked", async () => {
    const t = signOutcomeToken(listingId);
    const { tree } = await openPage(t, "through_site");
    const el = findAnswer(tree);
    expect(el?.props).toEqual({ token: t, chosen: "through_site", current: null });

    const rendered = OutcomeAnswer(el!.props);
    const all = buttons(rendered);
    expect(all.map((b) => b.props.children)).toEqual(Object.values(EMAIL_ANSWERS));
    const filled = all.find((b) => b.props.children === EMAIL_ANSWERS.through_site)!;
    expect(filled.props.className).toBe("btn-primary");
    expect(answerOutcomeAction).not.toHaveBeenCalled();

    filled.props.onClick();
    await Promise.all(h.transitions);
    expect(answerOutcomeAction).toHaveBeenCalledTimes(1);
    expect(answerOutcomeAction).toHaveBeenCalledWith(t, "through_site");
    expect((await outcomes()).map((o) => [o.listingId, o.outcome])).toEqual([[listingId, "through_site"]]);
    expect(await status()).toBe("taken");
  });

  it("still shows the invalid-link page for a bad token, and records nothing", async () => {
    const { html } = await openPage("not-a-token", "through_site");
    expect(html).toContain("This link isn");
    expect(answerOutcomeAction).not.toHaveBeenCalled();
    expect(await outcomes()).toHaveLength(0);
  });
});
