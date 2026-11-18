/**
 * The signed-out leak and cache-header checks, against a real deployment
 * (a preview or production), with the deployment's own database as the
 * source of what must never appear. Read-only everywhere: GET requests with
 * no session, and one read-only transaction.
 *
 *   BASE=https://<deployment> [BYPASS=<protection-bypass token> | TRUSTED_OIDC_TOKEN=<VERCEL_OIDC_TOKEN>] \
 *   DATABASE_URL_READONLY=$(neonctl connection-string <branch> --project-id … --org-id … --database-name catamount_sublets) \
 *   npm run check:deployment-leaks
 *
 * For a protected preview without the bypass secret, run it under
 * `vercel env run -- sh -c 'TRUSTED_OIDC_TOKEN="$VERCEL_OIDC_TOKEN" … npm run check:deployment-leaks'`:
 * the linked project's short-lived development token, never printed.
 *
 * Point the URL at the branch the deployment reads (rehearsal for previews,
 * main for production) and never print it. Every open listing's private
 * fields (address, street, true coordinates, contact and account email,
 * phone, display and poster name, a run of its description), public or
 * signed-in only, become strings that must not appear in any signed-out
 * response (true coordinates by coordinateLeaks' rule: both anywhere, or
 * either outside the public area fields). They are never printed: a hit names the field and listing id.
 * The local counterpart, against a seeded database, is check-public-leaks.ts.
 * Exits 1 on any failed check.
 */
import { neon } from "@neondatabase/serverless";
import { SITE } from "@/config/site";
import { coordinateLeaks } from "@/server/data/public-leak-fixture";

type Row = Record<string, unknown>;

const PRIVATE_KEYS =
  /"(address|shortAddress|lat|lon|posterName|contactEmail|contactPhone|hasPhone|description|mapsUrl|appleMapsUrl|roommatePreference|roommateGender)":/;
/** A public listing's approximate area is meant to be there; take it out before looking for "lat"/"lon" keys. */
const AREA = /"area":\{"lat":-?[\d.]+,"lon":-?[\d.]+,"radiusM":\d+\}/g;

async function main(): Promise<number> {
  const { BASE: base, BYPASS: bypass, DATABASE_URL_READONLY: url, TRUSTED_OIDC_TOKEN: oidc } = process.env;
  if (!base || !url) throw new Error("Set BASE and DATABASE_URL_READONLY (see the comment at the top).");
  const BASE = base.replace(/\/$/, "");
  const headers: Record<string, string> = { "user-agent": "Mozilla/5.0 (leak check)", ...(bypass ? { "x-vercel-protection-bypass": bypass } : {}), ...(oidc ? { "x-vercel-trusted-oidc-idp-token": oidc } : {}) };

  const sql = neon(url);
  const [, all, pub, hidden, counts] = (await sql.transaction(
    (tx) => [
      tx`begin read only`,
      tx`select l.id, l.address, l.lat, l.lon, l.description, l.contact_email, l.contact_phone, l.display_name, u.email, u.first_name, u.last_name
         from listings l join "user" u on u.id = l.user_id where l.status = 'open'`,
      tx`select id from listings where not signed_in_only and area_lat is not null and status = 'open'`,
      tx`select min(id)::int id from listings where signed_in_only and status = 'open'`,
      tx`select count(*) filter (where status = 'open')::int open, count(*) filter (where status = 'open' and not signed_in_only)::int public from listings`,
    ],
    { readOnly: true },
  )) as Row[][];

  // [field, listing id, value]: every open listing's private fields; none may appear signed out.
  const needles: [string, number, string][] = [];
  // [listing id, true point]: read by coordinateLeaks (both coordinates anywhere, or either outside the public area fields).
  const points: [number, { lat: number; lon: number }][] = [];
  // The site's own addresses (the footer's support mailto) are published on every page; an account that uses one (the admin's) is not a leak.
  const published = new Set((Object.values(SITE) as unknown[]).filter((v): v is string => typeof v === "string" && v.includes("@")).map((v) => v.toLowerCase()));
  for (const r of all) {
    const id = Number(r.id);
    const add = (v: unknown, field: string) => {
      const s = v === null || v === undefined ? "" : String(v).trim();
      if (s.length >= 4 && !published.has(s.toLowerCase())) needles.push([field, id, s]);
    };
    const first = String(r.address ?? "").split(",")[0]; // "62 King Street"
    add(first, "address");
    const street = first.replace(/^\s*\d+[A-Za-z]?\s+/, "");
    if (street.split(/\s+/).slice(0, -1).join(" ").length >= 4) add(street, "street"); // the street name with its suffix
    if (typeof r.lat === "number" && typeof r.lon === "number") points.push([id, { lat: r.lat, lon: r.lon }]);
    add(r.contact_email, "contact email");
    add(r.email, "account email");
    add(String(r.contact_phone ?? "").replace(/\D/g, "").slice(-7), "phone"); // last 7 digits
    add(r.display_name, "display name");
    if (r.first_name && r.last_name) add(`${r.first_name} ${r.last_name}`, "poster name");
    const words = String(r.description ?? "").replace(/\s+/g, " ").trim();
    if (words.length > 40) add(words.slice(10, 40), "description"); // a run of the description
  }

  let fails = 0;
  const ok = (good: boolean, what: string) => {
    if (!good) fails++;
    console.log(`  ${good ? "ok  " : "FAIL"} ${what}`);
  };
  async function get(path: string, rsc = false) {
    const h = { ...headers, ...(rsc ? { RSC: "1" } : {}) };
    let res = await fetch(BASE + path, { headers: h, redirect: "manual" });
    // Next answers an RSC request without its cache-busting `_rsc` parameter with a redirect that adds it; follow that one.
    const loc = res.headers.get("location");
    if (rsc && loc && /[?&]_rsc(=|&|$)/.test(loc)) res = await fetch(new URL(loc, BASE), { headers: h, redirect: "manual" });
    return { status: res.status, cc: res.headers.get("cache-control") ?? "", ct: res.headers.get("content-type") ?? "", body: await res.text() };
  }
  const hits = new Map<string, string[]>();
  const leaked = (body: string, where: string) => {
    const found = needles.filter(([, , v]) => body.includes(v)).map(([f, id]) => `${f} of #${id}`);
    for (const [id, point] of points) found.push(...coordinateLeaks(body, point).map((c) => `${c} of #${id}`));
    const key = body.replace(AREA, "").match(PRIVATE_KEYS);
    if (key) found.push(`a private key (${key[1]})`);
    if (found.length) hits.set(where, found);
    return found.length;
  };
  const noShared = (cc: string) => /\bprivate\b/.test(cc) && /\bno-store\b/.test(cc) && !/\b(public|s-maxage|stale-while-revalidate)\b/.test(cc);

  console.log(`${BASE}: ${counts[0].open} open listings, ${counts[0].public} public; ${needles.length} private strings and ${points.length} true points (every open listing's) to look for`);
  const pubIds = pub.map((r) => Number(r.id));
  const pages = ["/", "/browse", "/map", "/browse?sort=closest&max_distance=2", ...pubIds.map((id) => `/listing/${id}`), ...pubIds.map((id) => `/browse?id=${id}&via=share`)];
  for (const p of pages) {
    for (const rsc of [false, true]) {
      const r = await get(p, rsc);
      const tag = `${p}${rsc ? " (RSC)" : ""}`;
      ok(r.status === 200 && (!rsc || r.ct.includes("text/x-component")), `${tag}: ${r.status}`);
      ok(leaked(r.body, tag) === 0, `${tag}: nothing private`);
      if (p !== "/") ok(noShared(r.cc), `${tag}: Cache-Control ${r.cc}`);
    }
  }
  const hiddenId = hidden[0]?.id;
  if (hiddenId) {
    const h = await get(`/listing/${hiddenId}`);
    ok(h.status === 404 && noShared(h.cc), `/listing/<signed-in-only>: ${h.status}, ${h.cc}`);
    const hr = await get(`/listing/${hiddenId}`, true);
    ok(hr.body.includes("NEXT_HTTP_ERROR_FALLBACK;404") && leaked(hr.body, "/listing/<signed-in-only> (RSC)") === 0, "/listing/<signed-in-only> (RSC): the 404 fallback, nothing private");
  }
  const sm = await get("/sitemap.xml");
  const listed = [...sm.body.matchAll(/\/listing\/(\d+)</g)].map((m) => Number(m[1])).sort((a, b) => a - b);
  ok(sm.status === 200 && JSON.stringify(listed) === JSON.stringify([...pubIds].sort((a, b) => a - b)), `sitemap.xml: lists exactly the public listings (${listed.join(", ") || "none"})`);
  ok(!/<lastmod>[^<]*T/.test(sm.body) && leaked(sm.body, "sitemap.xml") === 0, "sitemap.xml: dates only, nothing private");
  const rb = await get("/robots.txt");
  ok(rb.status === 200 && /Disallow: \/post/.test(rb.body) && !/Disallow: \/browse/.test(rb.body), "robots.txt: board allowed, /post disallowed");
  for (const [where, found] of hits) console.log(`  hit on ${where}: ${found.join(", ")}`);
  console.log(fails ? `${fails} check(s) failed.` : "All checks passed.");
  return fails ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
