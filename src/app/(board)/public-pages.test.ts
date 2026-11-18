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
const { ACCESS, SITE } = await import("@/config/site");
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
const SERVER_COMPONENTS = new Set(["PublicListingDetails", "PublicCta", "SignedInOnlyNote", "AllSignedInOnly", "UtilitiesAndAmenities", "SaveSearch"]);

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
  viewer = { id: v.id, email: "viewer@uvm.edu", name: "viewer", role: "user", tier: "student", legacyNetid: null };
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
    expect(page).toContain(`"${ACCESS.schools}"," students: sign in to see the exact address and contact the poster. Anyone else: sign in with any email to message the poster."`);
    expect(page).toContain(`"${ACCESS.schools}"," students: sign in to read the description."`);
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
      // It is the only listing, so nothing is public: one message, a count and nothing else, not "1 more" beside "No listings up right now".
      expect(page).toContain(`"The 1 listing up is"," visible to ","${ACCESS.audience}"," only right now."`);
      expect(page).not.toContain("more listing");
      expect(page).not.toContain("No listings up right now.");
      const mapPage = await text(await map.default({ searchParams: noParams() }));
      expect(mapPage).not.toContain(`"id":${secretId},`);
      expect(mapPage).toContain(`"The 1 listing up is"," visible to ","${ACCESS.audience}"," only right now."`);
      expect(mapPage).not.toContain("more listing");
      expect(JSON.stringify(await sitemap())).not.toContain(`/listing/${secretId}`);
      await expect(listing.default(idParams(secretId))).rejects.toMatchObject({ digest: expect.stringContaining("404") });
      const meta = JSON.stringify(await sharePage.generateMetadata({ params: Promise.resolve({ slug: shareSlug(secretId) }) }));
      expect(meta).toContain("$875");
    } finally {
      await setListingVisibility(h.db, secretId, admin, false);
    }
  });

  it("beside a public listing, it is only the \"1 more\" note", async () => {
    const [u] = await h.db.insert(s.user).values({ email: "other@uvm.edu", name: "other" }).returning({ id: s.user.id });
    const [l] = await h.db.insert(s.listings).values({ userId: u.id, price: 650, address: "9 Elsewhere Rd, Burlington", lat: 44.47, lon: -73.2 }).returning({ id: s.listings.id });
    await setListingSemesters(h.db, l.id, [{ code: "spring27", position: 0 }]);
    await h.db.insert(s.listingPhotos).values({ listingId: l.id, sortOrder: 0, stem: "r".repeat(32), displayUrl: "/p/e.webp", thumbUrl: "/p/f.webp", cardUrl: "/p/g.jpg", sha256: "0".repeat(64) });
    await setListingVisibility(h.db, l.id, admin, false);
    await setListingVisibility(h.db, secretId, admin, true);
    try {
      for (const page of [await text(await browse.default({ searchParams: noParams() })), await text(await map.default({ searchParams: noParams() }))]) {
        expect(page).toContain(`"1 more listing is visible to ${ACCESS.audience} only."`);
        expect(page).not.toContain("only right now.");
        expect(page).toContain('"price":650');
      }
      // Filtered down to nothing: the usual message, and the note still says what is behind sign-in.
      const none = await text(await browse.default({ searchParams: Promise.resolve({ min_price: "4000", max_price: "5000" }) }));
      expect(none).toContain('"listings":[],"openSource":"deeplink","anyExists":true,"filtered":true,"signedOut":true,"community":false}'); // ListingsGrid's own "Nothing matches those filters."
      expect(none).toContain('"1 more listing is');
    } finally {
      await setListingVisibility(h.db, secretId, admin, false);
      await h.db.delete(s.listings).where(eq(s.listings.id, l.id));
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
    // Every one asks the viewer level (src/server/viewer.ts), which reads the session.
    expect(src).toMatch(/getViewer\(\)/);
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

/**
 * A community account (an address outside the schools) is signed in but
 * sees exactly what a signed-out visitor sees: the same leak checks, the
 * same hidden-listing rules, no contact details by any route. Only the frame
 * differs: saved searches and Message poster.
 */
describe("a community account sees only the public board", () => {
  let community: SessionUser;
  beforeAll(async () => {
    const [c] = await h.db.insert(s.user).values({ email: "robin@gmail.com", name: "robin", firstName: "Robin", lastName: "Lee", tier: "community" }).returning({ id: s.user.id });
    community = { id: c.id, email: "robin@gmail.com", name: "robin", role: "user", tier: "community", legacyNetid: null };
  });
  beforeEach(() => {
    h.user = community;
  });

  it("on Browse and the Map: PublicListing only, nothing that locates the place or reaches the poster", async () => {
    const page = await text(await browse.default({ searchParams: noParams() }));
    expect(page).toContain('"audience":"public"');
    expect(page).not.toContain('"address"');
    expect(leaks(page)).toEqual([]);
    // Saved searches and the relay are theirs; the relay carries only their own name and address.
    expect(page).toContain('"type":"SaveSearchButton"');
    expect(page).toContain('"relay":{"name":"Robin Lee","email":"robin@gmail.com"}');
    const mapPage = await text(await map.default({ searchParams: noParams() }));
    expect(mapPage).toContain('"area":{');
    expect(mapPage).not.toContain(`"lat":${SECRET.lat}`);
    expect(leaks(mapPage)).toEqual([]);
  });

  it("with a share link's ?id=, the same", async () => {
    expect(leaks(await text(await browse.default({ searchParams: Promise.resolve({ id: String(secretId), via: "share" }) })))).toEqual([]);
  });

  it("a listing kept to students is not on their board, and the note offers no sign-in", async () => {
    await setListingVisibility(h.db, secretId, admin, true);
    try {
      for (const page of [await text(await browse.default({ searchParams: noParams() })), await text(await map.default({ searchParams: noParams() }))]) {
        expect(page).not.toContain(`"id":${secretId},`);
        expect(page).toContain(`"The 1 listing up is"," visible to ","${ACCESS.audience}"," only right now."`);
        expect(page).not.toContain("/sign-in");
        expect(leaks(page)).toEqual([]);
      }
      const followed = await text(await browse.default({ searchParams: Promise.resolve({ id: String(secretId), via: "share" }) }));
      // Only the URL's own ?id= echoes back; no listing comes with it.
      expect(followed).toContain('"listings":[],"openId":');
      expect(leaks(followed)).toEqual([]);
    } finally {
      await setListingVisibility(h.db, secretId, admin, false);
    }
  });

  it("gets no contact details from the panel's Server Action, on a public listing or a hidden one", async () => {
    const { fetchContactDetails } = await import("@/server/actions/listings");
    expect(await fetchContactDetails(secretId)).toBeNull();
    await setListingVisibility(h.db, secretId, admin, true);
    try {
      expect(await fetchContactDetails(secretId)).toBeNull();
    } finally {
      await setListingVisibility(h.db, secretId, admin, false);
    }
    h.user = viewer; // positive control: a student does get them
    expect(await fetchContactDetails(secretId)).toMatchObject({ email: SECRET.contactEmail });
  });

  it("the listing's URL goes to the board, which decides by viewer level", async () => {
    await expect(listing.default(idParams(secretId))).rejects.toMatchObject({ digest: expect.stringContaining(`/browse?id=${secretId}`) });
  });

  it("student, then community, then signed out: nothing carries over", async () => {
    h.user = viewer;
    expect(await text(await browse.default({ searchParams: noParams() }))).toContain(SECRET.street);
    h.user = community;
    expect(leaks(await text(await browse.default({ searchParams: noParams() })))).toEqual([]);
    h.user = null;
    expect(leaks(await text(await browse.default({ searchParams: noParams() })))).toEqual([]);
  });

  it("an account with no tier on record reads as community (fails closed)", async () => {
    h.user = { ...community, tier: "bogus" as unknown as "community" };
    const page = await text(await browse.default({ searchParams: noParams() }));
    expect(page).toContain('"audience":"public"');
    expect(leaks(page)).toEqual([]);
  });
});
