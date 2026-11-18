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
 *
 * And as a seeded community account (an address outside the schools, phase
 * 31): every page above gets the same leak checks with its cookie, the
 * listing kept to students stays off its board, and the contact panel's
 * Server Action, called over HTTP by its id from the build's manifest,
 * returns nothing for it (with the student as the positive control).
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
import { readFileSync } from "node:fs";
import { ACCESS, ALLOWED_EMAIL_DOMAINS } from "@/config/site";
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

/** The leak fixture (public), a second listing kept to students, a signed-in student and a community account, each with a session. */
async function seed(): Promise<{
  publicId: number;
  hiddenId: number;
  cookie: string;
  communityCookie: string;
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
      tier: "student",
    })
    .returning({ id: s.user.id });
  const [community] = await db
    .insert(s.user)
    .values({ email: "robin@example.net", name: "robin", firstName: "Robin", lastName: "Lee", emailVerified: true, tier: "community" })
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

  await db.insert(s.siteNotices).values({
    title: `Students: ${NOTICE_MARKER}`,
    bodyMd: `Only for **signed-in** students: ${NOTICE_MARKER}-body.`,
    audience: "signed_in",
    active: true,
  });

  const sessionCookie = async (userId: string) => {
    const token = randomBytes(24).toString("hex");
    await db.insert(s.session).values({ token, userId, expiresAt: new Date(Date.now() + 3_600_000), updatedAt: new Date() });
    // better-auth's signed cookie: the token, a dot, and HMAC-SHA256 of the token under its secret, base64.
    const signature = createHmac("sha256", process.env.BETTER_AUTH_SECRET!).update(token).digest("base64");
    return `catamount.session_token=${encodeURIComponent(`${token}.${signature}`)}`;
  };
  const cookie = await sessionCookie(viewer.id);
  const communityCookie = await sessionCookie(community.id);
  await client.close();
  return { publicId, hiddenId, cookie, communityCookie };
}

/** Calls a Server Action over HTTP the way the browser does, by the id the build gave it. */
async function callAction(exportedName: string, args: unknown[], cookie: string): Promise<{ status: number; body: string }> {
  const manifest = JSON.parse(readFileSync(path.join(".next", "server", "server-reference-manifest.json"), "utf8")) as {
    node: Record<string, { exportedName?: string }>;
  };
  const id = Object.entries(manifest.node).find(([, v]) => v.exportedName === exportedName)?.[0];
  if (!id) throw new Error(`no Server Action ${exportedName} in the build`);
  const res = await fetch(`${BASE}/browse`, {
    method: "POST",
    headers: { "Next-Action": id, "content-type": "text/plain;charset=UTF-8", accept: "text/x-component", origin: BASE, cookie },
    body: JSON.stringify(args),
  });
  return { status: res.status, body: await res.text() };
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
  const { publicId, hiddenId, cookie, communityCookie } = await seed();
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
    const mapRsc = await get("/map", { rsc: true });
    check(/"area":\{"lat":[\d.]+,"lon":-[\d.]+,"radiusM":150\}/.test(mapRsc.body), "/map (RSC): carries its approximate area");
    const page = await get(`/listing/${publicId}`);
    check(/2BR · /.test(page.body) && page.body.includes("$875"), `/listing/${publicId}: shows the public listing`);
    const plain = page.body.replace(/<!-- -->/g, "");
    check(plain.includes(`${ACCESS.schools} students: sign in to read the description.`), `/listing/${publicId}: says to sign in for the description`);
    check(!page.body.includes(SECRET.descriptionMarker), `/listing/${publicId}: none of the description`);
    check(plain.includes(`${ACCESS.schools} students: sign in to see the exact address and contact the poster.`), `/listing/${publicId}: shows the sign-in prompt`);
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
      browse.body.replace(/<!-- -->/g, "").includes(`1 more listing is visible to ${ACCESS.audience} only.`),
      `/browse: says 1 more listing is visible to ${ACCESS.audience} only`,
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

    console.log("A community account (signed in, outside the schools) sees what a signed-out visitor sees:");
    for (const p of pages) {
      for (const rsc of [false, true]) {
        const r = await get(p, { cookie: communityCookie, rsc });
        const what = `${p}${rsc ? " (RSC)" : ""} community`;
        // /listing/<id> sends any signed-in account to the board, which decides by viewer level.
        check(r.status === 200 || (p.startsWith("/listing/") && r.status === 307), `${what}: ${r.status}`);
        noLeaks(what, r.body);
        check(!r.body.includes("Hiddenmoor") && !r.body.includes('"price":990'), `${what}: the listing kept to students is not there`);
        check(!r.body.includes(NOTICE_MARKER), `${what}: no students' notice`);
      }
    }
    const communityBoard = await get("/browse", { cookie: communityCookie, rsc: true });
    check(communityBoard.body.includes('"audience":"public"') && communityBoard.body.includes('"price":875'), "/browse (RSC) community: the public listing, as PublicListing (positive control)");
    check(!communityBoard.body.includes(`"address"`), "/browse (RSC) community: no address field at all");
    check(
      (await get("/browse", { cookie: communityCookie })).body.replace(/<!-- -->/g, "").includes(`1 more listing is visible to ${ACCESS.audience} only.`),
      "/browse community: the count of listings kept to students, and nothing more",
    );
    const hiddenFollowed = await get(`/browse?id=${hiddenId}&via=share`, { cookie: communityCookie, rsc: true });
    check(!hiddenFollowed.body.includes("Hiddenmoor") && !hiddenFollowed.body.includes('"price":990'), "/browse?id=<hidden> community: not on their board");

    console.log("The contact panel's Server Action, over HTTP:");
    const studentContact = await callAction("fetchContactDetails", [publicId], cookie);
    check(studentContact.body.includes(SECRET.contactEmail), `fetchContactDetails as a student: the contact email (positive control, ${studentContact.status})`);
    for (const id of [publicId, hiddenId]) {
      const r = await callAction("fetchContactDetails", [id], communityCookie);
      noLeaks(`fetchContactDetails(${id === publicId ? "public" : "hidden"}) as community`, r.body);
      check(!r.body.includes(SECRET.contactEmail) && !r.body.includes(SECRET.phone) && !r.body.includes("Hilda") && !r.body.includes(`hidden@${ALLOWED_EMAIL_DOMAINS[0]}`), `fetchContactDetails(${id === publicId ? "public" : "hidden"}) as community: no contact details (${r.status})`);
    }
    const anonContact = await callAction("fetchContactDetails", [publicId], "");
    check(!anonContact.body.includes(SECRET.contactEmail), `fetchContactDetails signed out: no contact details (${anonContact.status})`);

    console.log("Community, then student, then signed out (no cache crosses over):");
    for (const p of ["/browse", "/map"]) {
      await get(p, { cookie, rsc: true });
      noLeaks(`${p} (RSC) community after student`, (await get(p, { cookie: communityCookie, rsc: true })).body);
      noLeaks(`${p} (RSC) signed out after community`, (await get(p, { rsc: true })).body);
    }
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
