/**
 * Proves over real HTTP that a signed-out visitor never receives a listing's
 * address, true point, poster or contact details: HTML, RSC payloads, the
 * metadata in them, the sitemap, the share page and the beacon. Runs the
 * production build (`npm run build` first) with `next start` against a
 * throwaway PGlite database it seeds itself (never DATABASE_URL), so it
 * touches no real data and needs no account.
 *
 *   npm run build && npm run check:public-leaks
 *
 * It also signs in as a seeded student (a session row and its signed cookie)
 * and requests the same pages with and then without the cookie, so a cache
 * that served the signed-in render to the signed-out request would show.
 * Exits 1 on any leak or failed check.
 */
import { spawn } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { ALLOWED_EMAIL_DOMAINS } from "@/config/site";
import * as s from "@/db/schema";
import { shareSlug } from "@/lib/share";
import { leaks, SECRET } from "@/server/data/public-leak-fixture";
import { fuzzedArea } from "@/server/geo-fuzz";

const PORT = Number(process.env.LEAK_CHECK_PORT ?? 3123);
/** In the live popup notice, which is for signed-in students only: no signed-out response may carry it. */
const NOTICE_MARKER = "zqnotice-for-students-only";
const BASE = `http://localhost:${PORT}`;
const dataDir = mkdtempSync(path.join(tmpdir(), "public-leaks-"));

// The server and this script must agree on the secrets (the fuzz and share tokens derive from APP_SECRET).
process.env.APP_SECRET = randomBytes(32).toString("hex");
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString("hex");
process.env.APP_URL = BASE;
delete process.env.DATABASE_URL;

const failures: string[] = [];
const pass = (what: string) => console.log(`  ok   ${what}`);
const fail = (what: string) => {
  failures.push(what);
  console.log(`  FAIL ${what}`);
};
const check = (ok: boolean, what: string) => (ok ? pass(what) : fail(what));

/** The leak fixture (public), a second listing kept to signed-in students, and a signed-in student with a session. */
async function seed(): Promise<{
  publicId: number;
  houseId: number;
  hiddenId: number;
  cookie: string;
}> {
  const client = new PGlite(dataDir);
  const db = drizzle({ client, schema: s, casing: "snake_case" });
  await migrate(db, { migrationsFolder: "drizzle" });
  await db.insert(s.semesters).values([
    { code: "spring27", name: "Spring 2027", active: true },
    { code: "summer27", name: "Summer 2027", active: true }, // only the signed-in-only listing runs for it
  ]);
  const [poster] = await db
    .insert(s.user)
    .values({
      email: SECRET.email,
      name: "zq",
      firstName: SECRET.first,
      lastName: SECRET.last,
    })
    .returning({ id: s.user.id });
  const [other] = await db
    .insert(s.user)
    .values({
      email: `hidden@${ALLOWED_EMAIL_DOMAINS[0]}`,
      name: "hidden",
      firstName: "Hilda",
      lastName: "Hidden",
    })
    .returning({ id: s.user.id });
  const [viewer] = await db
    .insert(s.user)
    .values({
      email: `viewer@${ALLOWED_EMAIL_DOMAINS[0]}`,
      name: "viewer",
      firstName: "Vic",
      lastName: "Viewer",
      emailVerified: true,
    })
    .returning({ id: s.user.id });

  const add = async (
    userId: string,
    v: Partial<typeof s.listings.$inferInsert> & {
      lat: number;
      lon: number;
      price: number;
      address: string;
    },
  ) => {
    const [l] = await db
      .insert(s.listings)
      .values({ userId, ...v })
      .returning({ id: s.listings.id });
    const area = fuzzedArea(v.lat, v.lon);
    await db.update(s.listings).set({ areaLat: area.lat, areaLon: area.lon }).where(eq(s.listings.id, l.id));
    await db.insert(s.listingSemesters).values({ listingId: l.id, semesterCode: "spring27", position: 0 });
    await db.insert(s.listingPhotos).values({
      listingId: l.id,
      sortOrder: 0,
      stem: `leak${l.id}`.padEnd(32, "0"),
      displayUrl: "/icon.svg",
      thumbUrl: "/icon.svg",
      cardUrl: "/icon.svg",
      sha256: "0".repeat(64),
    });
    return l.id;
  };
  const publicId = await add(poster.id, {
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
  });
  const hiddenId = await add(other.id, {
    price: 990,
    address: "77 Hiddenmoor Court, Burlington",
    lat: 44.4712,
    lon: -73.2049,
    signedInOnly: true,
    description: "Kept for signed-in students.",
  });
  await db.update(s.listingSemesters).set({ semesterCode: "summer27" }).where(eq(s.listingSemesters.listingId, hiddenId));
  // A whole house typed as its total: rooms, basis and per-room price are public, its address and poster are not.
  const [group] = await db
    .insert(s.user)
    .values({ email: `group@${ALLOWED_EMAIL_DOMAINS[0]}`, name: "group", firstName: "Gwen", lastName: "Groupwood" })
    .returning({ id: s.user.id });
  const houseId = await add(group.id, {
    price: 3200,
    priceBasis: "total",
    roomsAvailable: 4,
    bedrooms: 4,
    roommates: 0,
    address: "9 Groupwood Lane, Burlington",
    lat: 44.4801,
    lon: -73.2003,
    description: "The whole Groupwood house.",
  });

  await db.insert(s.siteNotices).values({
    title: `Students: ${NOTICE_MARKER}`,
    bodyMd: `Only for **signed-in** students: ${NOTICE_MARKER}-body.`,
    audience: "signed_in",
    active: true,
  });

  const token = randomBytes(24).toString("hex");
  await db.insert(s.session).values({
    token,
    userId: viewer.id,
    expiresAt: new Date(Date.now() + 3_600_000),
    updatedAt: new Date(),
  });
  await client.close();
  // better-auth's signed cookie: the token, a dot, and HMAC-SHA256 of the token under its secret, base64.
  const signature = createHmac("sha256", process.env.BETTER_AUTH_SECRET!).update(token).digest("base64");
  return {
    publicId,
    houseId,
    hiddenId,
    cookie: `catamount.session_token=${encodeURIComponent(`${token}.${signature}`)}`,
  };
}

async function startServer(): Promise<() => void> {
  const child = spawn(path.join("node_modules", ".bin", "next"), ["start", "-p", String(PORT)], {
    env: { ...process.env, PGLITE_DATA_DIR: dataDir, NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (d) => (output += d));
  child.stderr.on("data", (d) => (output += d));
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`${BASE}/robots.txt`)).ok) return () => child.kill("SIGTERM");
    } catch {
      // not up yet
    }
    if (child.exitCode !== null) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  child.kill("SIGTERM");
  throw new Error(`next start did not come up:\n${output.slice(-2000)}`);
}

async function get(pathname: string, opts: { cookie?: string; rsc?: boolean } = {}) {
  const headers = {
    ...(opts.cookie ? { cookie: opts.cookie } : {}),
    ...(opts.rsc ? { RSC: "1" } : {}),
    "user-agent": "Mozilla/5.0 (leak check)",
  };
  let res = await fetch(`${BASE}${pathname}`, { redirect: "manual", headers });
  // Next answers an RSC request without its cache-busting `_rsc` parameter with a redirect that adds it; follow that one.
  const location = res.headers.get("location");
  if (opts.rsc && location && (res.status === 307 || res.status === 308) && /[?&]_rsc(=|&|$)/.test(location)) {
    res = await fetch(new URL(location, BASE), { redirect: "manual", headers });
  }
  const body = await res.text();
  if (opts.rsc && res.status === 200 && !(res.headers.get("content-type") ?? "").includes("text/x-component")) {
    fail(`${pathname} (RSC): got ${res.headers.get("content-type")}, not an RSC payload`);
  }
  return { status: res.status, headers: res.headers, body };
}

function noLeaks(what: string, body: string) {
  const found = leaks(body);
  check(found.length === 0, found.length ? `${what}: leaked ${found.join(", ")}` : `${what}: nothing leaked`);
}

async function main(): Promise<number> {
  const { publicId, houseId, hiddenId, cookie } = await seed();
  console.log(`Seeded ${dataDir}; starting next start on :${PORT}`);
  const stop = await startServer();
  try {
    const pages = ["/", "/browse", "/map", `/listing/${publicId}`, `/browse?id=${publicId}&via=share`, "/browse?sort=closest&maxDistance=3"];

    console.log("Signed out, HTML and RSC payloads:");
    for (const p of pages) {
      for (const rsc of [false, true]) {
        const r = await get(p, { rsc });
        check(r.status === 200, `${p}${rsc ? " (RSC)" : ""}: ${r.status}`);
        noLeaks(`${p}${rsc ? " (RSC)" : ""}`, r.body);
      }
    }
    // Positive controls: the public listing is really there, so "nothing leaked" means something.
    const boardRsc = await get("/browse", { rsc: true });
    check(
      boardRsc.body.includes('"price":875') && /"title":"2BR · [A-Za-z ]+"/.test(boardRsc.body),
      "/browse (RSC): carries the public listing (price, generated title)",
    );
    // A whole house: its rooms, basis and per-room price are on the public board, compared per room, and its address and poster are not.
    check(
      boardRsc.body.includes('"pricePerRoom":800') && boardRsc.body.includes('"roomsAvailable":4') && boardRsc.body.includes('"priceBasis":"total"'),
      "/browse (RSC): carries the whole house's rooms, basis and per-room price",
    );
    const houseBoard = await get("/browse?rooms=4&no_roommates=1&min_price=0&max_price=850", { rsc: true });
    check(houseBoard.body.includes(`"id":${houseId}`) && !houseBoard.body.includes(`"id":${publicId},`), "/browse?rooms=4&no_roommates=1&max_price=850 (RSC): finds the house by its per-room price, signed out");
    const housePage = await get(`/listing/${houseId}`);
    check(housePage.body.includes("Whole place · 4 BR") && housePage.body.includes("$3,200") && housePage.body.includes("$800/room"), `/listing/${houseId}: shows the total, the per-room price and the chip`);
    for (const [label, body] of [["/browse (RSC)", boardRsc.body], [`/listing/${houseId}`, housePage.body], ["/browse?rooms=4… (RSC)", houseBoard.body]] as const) {
      check(!/Groupwood/i.test(body), `${label}: none of the house's address, poster or description`);
    }
    const mapRsc = await get("/map", { rsc: true });
    check(/"area":\{"lat":[\d.]+,"lon":-[\d.]+,"radiusM":150\}/.test(mapRsc.body), "/map (RSC): carries its approximate area");
    const page = await get(`/listing/${publicId}`);
    check(/2BR · /.test(page.body) && page.body.includes("$875"), `/listing/${publicId}: shows the public listing`);
    check(page.body.includes("Sign in to read the description."), `/listing/${publicId}: says to sign in for the description`);
    check(!page.body.includes(SECRET.descriptionMarker), `/listing/${publicId}: none of the description`);
    check(page.body.includes("Sign in to see the exact address and contact the poster."), `/listing/${publicId}: shows the sign-in prompt`);
    check(!/"@type":\s*"(Product|Place|Residence|Accommodation|Offer)"/.test(page.body), `/listing/${publicId}: no listing JSON-LD`);
    check(/<meta name="robots" content="noindex/.test(page.body) === false, `/listing/${publicId}: indexable`);

    console.log("Caching headers on the board (no shared cache may keep a render):");
    for (const p of ["/browse", "/map", `/listing/${publicId}`, `/listing/${hiddenId}`, `/browse?id=${publicId}&via=share`]) {
      for (const opts of [{}, { rsc: true }, { cookie }, { cookie, rsc: true }]) {
        const r = await get(p, opts);
        const cc = r.headers.get("cache-control") ?? "";
        const what = `${p}${opts.rsc ? " (RSC)" : ""}${"cookie" in opts ? " signed in" : ""}`;
        check(
          /\bprivate\b/.test(cc) && /\bno-store\b/.test(cc) && !/\b(public|s-maxage|stale-while-revalidate)\b/.test(cc),
          `${what}: Cache-Control ${cc || "(none)"}`,
        );
      }
    }

    console.log("Kept to signed-in students:");
    const hidden = await get(`/listing/${hiddenId}`);
    check(hidden.status === 404, `/listing/${hiddenId}: ${hidden.status} (want 404)`);
    check(!hidden.body.includes("Hiddenmoor"), `/listing/${hiddenId}: says nothing about it`);
    const browse = await get("/browse");
    const browseRsc = await get("/browse", { rsc: true });
    check(!browse.body.includes("Hiddenmoor") && !browseRsc.body.includes('"price":990'), "/browse: not listed");
    check(
      /1 more listing.{0,40}visible to signed-in students/.test(browse.body.replace(/<!-- -->/g, "")),
      "/browse: says 1 more listing is visible to signed-in students",
    );
    const sems = (body: string) => body.match(/"semesters":\[[^\]]*\]/)?.[0] ?? "";
    check(
      sems(browseRsc.body).includes("spring27") && !sems(browseRsc.body).includes("summer27"),
      "/browse (RSC): Summer 2027 (signed-in-only listings only) is not a semester with listings",
    );
    check(/"emptySemesters":\[[^\]]*summer27/.test(browseRsc.body), "/browse (RSC): Summer 2027 is listed as (none yet), like any empty semester");
    check(!sems((await get("/map", { rsc: true })).body).includes("summer27"), "/map (RSC): Summer 2027 is not a semester with listings");
    check(!(await get("/")).body.includes("Summer 2027"), "/: does not name Summer 2027");
    const share = await get(`/s/${shareSlug(hiddenId)}`);
    check(share.status === 200 && share.body.includes("$990"), `/s/<hidden>: share link still works (${share.status})`);
    noLeaks("/s/<public>", (await get(`/s/${shareSlug(publicId)}`)).body);

    console.log("Sitemap, robots and the beacon:");
    const sitemap = await get("/sitemap.xml");
    check(sitemap.body.includes(`/listing/${publicId}<`), "sitemap.xml: lists the public listing");
    check(
      /<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/.test(sitemap.body) && !/<lastmod>[^<]*T/.test(sitemap.body),
      "sitemap.xml: last changes are dates, never times",
    );
    check(!sitemap.body.includes(`/listing/${hiddenId}<`), "sitemap.xml: leaves out the signed-in-only one");
    noLeaks("sitemap.xml", sitemap.body);
    console.log("Popup notice for signed-in students only:");
    for (const p of pages) {
      for (const rsc of [false, true]) {
        const r = await get(p, { rsc });
        check(!r.body.includes(NOTICE_MARKER), `${p}${rsc ? " (RSC)" : ""}: no signed-in notice`);
      }
    }
    const robots = await get("/robots.txt");
    check(!/Disallow: \/browse/.test(robots.body) && /Disallow: \/post/.test(robots.body), "robots.txt: board allowed, /post disallowed");
    const beacon = await fetch(`${BASE}/api/events`, {
      method: "POST",
      headers: {
        origin: BASE,
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": "Mozilla/5.0 (leak check)",
      },
      body: new URLSearchParams({
        type: "listing_open",
        listing_id: String(publicId),
        source: "browse",
      }),
    });
    check(beacon.status === 204 && (await beacon.text()) === "", `/api/events signed out: ${beacon.status}, empty body`);

    console.log("Signed in, then signed out again (no cache crosses over):");
    const signedIn = await get("/browse", { cookie });
    check(
      signedIn.status === 200 &&
        signedIn.body.includes(SECRET.street) &&
        signedIn.body.includes("Hiddenmoor") &&
        signedIn.body.includes(SECRET.descriptionMarker),
      "/browse signed in: full listings, both of them (positive control)",
    );
    check(signedIn.body.includes(`${NOTICE_MARKER}-body`), "/browse signed in: carries the signed-in notice (positive control)");
    for (const p of ["/browse", "/map", `/listing/${publicId}`]) {
      await get(p, { cookie });
      await get(p, { cookie, rsc: true });
      noLeaks(`${p} signed out after signed in`, (await get(p)).body);
      const after = (await get(p, { rsc: true })).body;
      noLeaks(`${p} (RSC) signed out after signed in`, after);
      check(!after.includes(NOTICE_MARKER), `${p} (RSC) signed out after signed in: no signed-in notice`);
    }
    const redirect = await get(`/listing/${publicId}`, { cookie });
    check(
      redirect.status === 307 && (redirect.headers.get("location") ?? "").includes(`/browse?id=${publicId}`),
      `/listing/${publicId} signed in: redirects to the board as before`,
    );
  } finally {
    stop();
    await new Promise((r) => setTimeout(r, 500));
    rmSync(dataDir, { recursive: true, force: true });
  }

  console.log(failures.length ? `\n${failures.length} check(s) failed.` : "\nAll checks passed.");
  return failures.length ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error);
    rmSync(dataDir, { recursive: true, force: true });
    process.exit(1);
  },
);
