import { readFileSync } from "node:fs";
import path from "node:path";
import { isValidElement, type ReactElement } from "react";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db";
import type { SessionUser } from "@/server/auth";

/**
 * What a signed-out visitor's request for the board can carry, page by page.
 * The pages run against a test database with the session mocked; their
 * async server components are run here, and every prop handed to a client
 * component (what Next serialises into the RSC payload) is collected as
 * JSON, together with the metadata, the sitemap, the share page's tags and
 * the share card's text. None of it may contain the seeded listing's
 * street, house number, true coordinates, poster or contact details.
 * scripts/check-public-leaks.ts checks the same over HTTP against `next start`.
 */
const h = vi.hoisted(() => ({ db: null as unknown as Db, user: null as SessionUser | null, card: null as unknown }));

vi.mock("@/db", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/db")>()), getDb: async () => h.db }));
vi.mock("@/server/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/auth")>()),
  getSessionUser: async () => h.user,
}));
vi.mock("next/og", () => ({
  ImageResponse: class {
    constructor(element: unknown) {
      h.card = element;
    }
  },
}));

const { createTestDb } = await import("@/db/test-db");
const s = await import("@/db/schema");
const { SITE } = await import("@/config/site");
const { eq } = await import("drizzle-orm");
const { setListingSemesters } = await import("@/server/data/semesters");
const { setListingVisibility } = await import("@/server/data/my-listing");
const { leaks, SECRET } = await import("@/server/data/public-leak-fixture");
const { shareSlug } = await import("@/lib/share");
const browse = await import("./browse/page");
const map = await import("./map/page");
const listing = await import("./listing/[id]/page");
const { default: sitemap } = await import("@/app/sitemap");
const sharePage = await import("@/app/s/[slug]/page");
const shareCard = await import("@/app/share-card/[slug]/[format]/route");

/** The board's server components with no "use client": RSC runs them on the server, so their output is in the payload. */
const SERVER_COMPONENTS = new Set(["PublicListingDetails", "PublicCta", "SignedInOnlyNote", "UtilitiesAndAmenities"]);

/** Runs server components (async ones, and the sync ones above); for a client component, keeps its props, as the RSC payload would. */
async function payload(node: unknown): Promise<unknown> {
  if (Array.isArray(node)) return Promise.all(node.map(payload));
  if (node instanceof Promise) return payload(await node);
  if (!isValidElement(node)) return typeof node === "function" ? "[function]" : node;
  const { type, props } = node as ReactElement<Record<string, unknown>>;
  if (typeof type === "function" && (type.constructor.name === "AsyncFunction" || SERVER_COMPONENTS.has(type.name))) {
    return payload(await (type as (p: unknown) => unknown)(props));
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) out[k] = await payload(v);
  return { type: typeof type === "string" ? type : ((type as { name?: string }).name ?? "component"), props: out };
}

const text = async (node: unknown) => JSON.stringify(await payload(node));
const noParams = () => Promise.resolve({});
const idParams = (id: number | string) => ({ params: Promise.resolve({ id: String(id) }) });

let close: () => Promise<void>;
let secretId: number;
let viewer: SessionUser;
const admin = { userId: "", isAdmin: true };

beforeAll(async () => {
  ({ db: h.db, close } = await createTestDb());
  await h.db.insert(s.semesters).values({ code: "spring27", name: "Spring 2027", active: true });
  const [poster] = await h.db.insert(s.user).values({ email: SECRET.email, name: "zq", firstName: SECRET.first, lastName: SECRET.last }).returning({ id: s.user.id });
  const [v] = await h.db.insert(s.user).values({ email: "viewer@uvm.edu", name: "viewer", firstName: "Vic", lastName: "Viewer" }).returning({ id: s.user.id });
  viewer = { id: v.id, email: "viewer@uvm.edu", name: "viewer", role: "user", legacyNetid: null };
  const [l] = await h.db
    .insert(s.listings)
    .values({
      userId: poster.id,
      price: 875,
      address: SECRET.address,
      lat: SECRET.lat,
      lon: SECRET.lon,
      bedrooms: 2,
      bathrooms: 1,
      description: SECRET.description,
      contactEmail: SECRET.contactEmail,
      contactPhone: SECRET.phone,
      displayName: `${SECRET.first} ${SECRET.last}`,
      roommatePreference: "women",
    })
    .returning({ id: s.listings.id });
  secretId = l.id;
  await setListingSemesters(h.db, l.id, [{ code: "spring27", position: 0 }]);
  await h.db.insert(s.listingPhotos).values({ listingId: l.id, sortOrder: 0, stem: "q".repeat(32), displayUrl: "/p/d.webp", thumbUrl: "/p/t.webp", cardUrl: "/p/c.jpg", sha256: "0".repeat(64) });
  await setListingVisibility(h.db, l.id, admin, false);
});
afterAll(() => close());
beforeEach(() => {
  h.user = null;
  h.card = null;
});

describe("signed out, nothing locates the place or reaches the poster", () => {
  it("on Browse, its metadata and the RSC props", async () => {
    const page = await text(await browse.default({ searchParams: noParams() }));
    expect(page).toContain('"audience":"public"');
    expect(page).toContain("2BR");
    expect(leaks(page)).toEqual([]);
    expect(leaks(JSON.stringify(await browse.generateMetadata()))).toEqual([]);
  });

  it("on Browse with a share link's ?id=", async () => {
    const page = await text(await browse.default({ searchParams: Promise.resolve({ id: String(secretId), via: "share" }) }));
    expect(leaks(page)).toEqual([]);
  });

  it("on the Map", async () => {
    const page = await text(await map.default({ searchParams: noParams() }));
    expect(page).toContain('"area":{');
    expect(leaks(page)).toEqual([]);
  });

  it("on the listing's own page and its metadata (title, description, Open Graph)", async () => {
    const page = await text(await listing.default(idParams(secretId)));
    const meta = JSON.stringify(await listing.generateMetadata(idParams(secretId)));
    expect(page).toContain("Sign in to see the exact address and contact the poster.");
    expect(page).toContain("Sign in to read the description.");
    expect(page).not.toContain(SECRET.descriptionMarker);
    expect(meta).toContain("2BR");
    expect(leaks(page)).toEqual([]);
    expect(leaks(meta)).toEqual([]);
    expect(page).not.toContain("application/ld+json");
  });

  it("in the sitemap", async () => {
    const xml = JSON.stringify(await sitemap());
    expect(xml).toContain(`/listing/${secretId}`);
    expect(leaks(xml)).toEqual([]);
  });

  it("on the share page's tags and in the share card's text", async () => {
    const slug = shareSlug(secretId);
    const meta = JSON.stringify(await sharePage.generateMetadata({ params: Promise.resolve({ slug }) }));
    expect(meta).toContain("$875");
    expect(leaks(meta)).toEqual([]);
    await shareCard.GET(new Request(`https://example.test/share-card/${slug}/og`), { params: Promise.resolve({ slug, format: "og" }) });
    const card = await text(h.card);
    expect(card).toContain("$875");
    expect(leaks(card)).toEqual([]);
  });
});

describe("a signed-in render does not carry over to the next signed-out one", () => {
  it("Browse: signed in sees everything (positive control), then signed out sees none of it", async () => {
    h.user = viewer;
    const signedIn = await text(await browse.default({ searchParams: noParams() }));
    expect(signedIn).toContain(SECRET.street);
    expect(signedIn).toContain(`${SECRET.first} ${SECRET.last}`);
    expect(signedIn).toContain(SECRET.descriptionMarker);
    h.user = null;
    expect(leaks(await text(await browse.default({ searchParams: noParams() })))).toEqual([]);
  });

  it("the listing: signed in goes to the board as before, then signed out gets the public page", async () => {
    h.user = viewer;
    await expect(listing.default(idParams(secretId))).rejects.toMatchObject({ digest: expect.stringContaining(`/browse?id=${secretId}`) });
    h.user = null;
    expect(leaks(await text(await listing.default(idParams(secretId))))).toEqual([]);
  });
});

describe("the description is signed-in only", () => {
  it("the signed-out page is the same whether a listing has a description or not: nothing derived from it", async () => {
    const withText = await text(await listing.default(idParams(secretId)));
    await h.db.update(s.listings).set({ description: null }).where(eq(s.listings.id, secretId));
    try {
      expect(await text(await listing.default(idParams(secretId)))).toBe(withText);
    } finally {
      await h.db.update(s.listings).set({ description: SECRET.description }).where(eq(s.listings.id, secretId));
    }
  });

  it("is not in the metadata (built from the generated title, price, size, semester and area)", async () => {
    const meta = JSON.stringify(await listing.generateMetadata(idParams(secretId)));
    for (const word of ["sunny", "bus", "laundry", SECRET.descriptionMarker]) expect(meta).not.toContain(word);
  });
});

describe("a listing kept to signed-in students", () => {
  it("is off signed-out Browse, the Map and the sitemap, its URL is a 404, and its share link still works", async () => {
    await setListingVisibility(h.db, secretId, admin, true);
    try {
      const page = await text(await browse.default({ searchParams: noParams() }));
      expect(page).not.toContain(`"id":${secretId},`);
      expect(page).toContain('[1," more listing"," is"," visible to signed-in students."'); // the note, a count and nothing else
      expect(await text(await map.default({ searchParams: noParams() }))).not.toContain(`"id":${secretId},`);
      expect(JSON.stringify(await sitemap())).not.toContain(`/listing/${secretId}`);
      await expect(listing.default(idParams(secretId))).rejects.toMatchObject({ digest: expect.stringContaining("404") });
      const meta = JSON.stringify(await sharePage.generateMetadata({ params: Promise.resolve({ slug: shareSlug(secretId) }) }));
      expect(meta).toContain("$875");
    } finally {
      await setListingVisibility(h.db, secretId, admin, false);
    }
  });

  it("a bad id is the same 404", async () => {
    for (const id of ["999999", "abc", "12abc", "-1"]) await expect(listing.default(idParams(id))).rejects.toMatchObject({ digest: expect.stringContaining("404") });
  });
});

describe("nothing on the board is cached across sessions", () => {
  it.each(["browse/page.tsx", "map/page.tsx", "listing/[id]/page.tsx", "layout.tsx"])("%s has no static or cached render", (file) => {
    const src = readFileSync(path.join(process.cwd(), "src/app/(board)", file), "utf8");
    expect(src).not.toMatch(/export const (revalidate|dynamic|fetchCache)\b/);
    expect(src).not.toMatch(/unstable_cache|"use cache"|generateStaticParams/);
    expect(src).toMatch(/getSessionUser\(\)/);
  });
});

describe("signed in, nothing changed", () => {
  it("Browse still gets the full DTO with address, pin and poster", async () => {
    h.user = viewer;
    const page = await text(await browse.default({ searchParams: noParams() }));
    expect(page).toContain(`"address":"${SECRET.address}"`);
    expect(page).toContain(`"lat":${SECRET.lat}`);
    expect(page).not.toContain('"audience":"public"');
    expect(await browse.generateMetadata()).toEqual({ title: `Browse · ${SITE.name}` });
  });
});
