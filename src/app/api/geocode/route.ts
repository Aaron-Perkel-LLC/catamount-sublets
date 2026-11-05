import { NextResponse } from "next/server";
import { z } from "zod";
import { CAMPUS, SITE } from "@/config/site";
import { formatAddress, shortAddressFromDetails } from "@/lib/format";
import { requireUserOrThrow } from "@/server/auth";
import { log } from "@/server/log";

export const runtime = "nodejs";

/**
 * Address lookups for the post form, proxied so the browser never talks to
 * the geocoders and the keys/user-agents stay here.
 *
 *   ?q=…        suggestions as you type → Photon (komoot), which allows
 *               autocomplete; Nominatim's policy forbids it. Biased to
 *               campus and boxed to roughly the 50-mile posting radius.
 *   ?lat=&lon=  a dropped pin → Nominatim reverse (one request per tap, which
 *               its policy allows), zoom 18; 404 where there is no street.
 */
const UA = `${SITE.name.replace(/\s+/g, "")}/1.0 (${SITE.supportEmail})`;
const BBOX = "-74.5,43.6,-71.9,45.3";

const search = z.object({ q: z.string().trim().min(3).max(120) });
const reverse = z.object({ lat: z.coerce.number().min(-90).max(90), lon: z.coerce.number().min(-180).max(180) });

export interface GeocodeHit {
  display_name: string;
  short_name: string;
  lat: number;
  lon: number;
}

export async function GET(request: Request) {
  const user = await requireUserOrThrow().catch(() => null);
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const url = new URL(request.url);
  const params = Object.fromEntries(url.searchParams.entries());

  const s = search.safeParse(params);
  if (s.success) {
    try {
      const u = new URL("https://photon.komoot.io/api/");
      u.searchParams.set("q", s.data.q);
      u.searchParams.set("lat", String(CAMPUS.lat));
      u.searchParams.set("lon", String(CAMPUS.lon));
      u.searchParams.set("limit", "6");
      u.searchParams.set("lang", "en");
      u.searchParams.set("bbox", BBOX);
      const res = await fetch(u, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`photon ${res.status}`);
      const json = (await res.json()) as { features?: PhotonFeature[] };
      const hits = (json.features ?? []).map(photonHit).filter((h): h is GeocodeHit => h !== null);
      return NextResponse.json(hits, { headers: { "Cache-Control": "private, max-age=600" } });
    } catch (error) {
      log.warn("geocode.search_failed", { message: error instanceof Error ? error.message : String(error) });
      return NextResponse.json({ error: "lookup_failed" }, { status: 502 });
    }
  }

  const r = reverse.safeParse(params);
  if (r.success) {
    try {
      const u = new URL("https://nominatim.openstreetmap.org/reverse");
      u.searchParams.set("lat", String(r.data.lat));
      u.searchParams.set("lon", String(r.data.lon));
      u.searchParams.set("format", "json");
      u.searchParams.set("zoom", "18");
      u.searchParams.set("addressdetails", "1");
      const res = await fetch(u, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`nominatim ${res.status}`);
      const json = (await res.json()) as { display_name?: string; address?: Record<string, string>; error?: string };
      if (!json.display_name || !json.address?.road) return NextResponse.json({ error: "no_match" }, { status: 404 });
      return NextResponse.json(
        { short_name: shortAddressFromDetails(json.display_name, json.address), display_name: json.display_name },
        { headers: { "Cache-Control": "private, max-age=600" } },
      );
    } catch (error) {
      log.warn("geocode.reverse_failed", { message: error instanceof Error ? error.message : String(error) });
      return NextResponse.json({ error: "lookup_failed" }, { status: 502 });
    }
  }

  return NextResponse.json({ error: "bad_request" }, { status: 400 });
}

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    name?: string;
    housenumber?: string;
    street?: string;
    district?: string;
    city?: string;
    county?: string;
    state?: string;
    postcode?: string;
    country?: string;
    osm_key?: string;
    osm_value?: string;
  };
}

/** Photon's feature → the shape the combobox shows and stores. */
function photonHit(f: PhotonFeature): GeocodeHit | null {
  const p = f.properties ?? {};
  const [lon, lat] = f.geometry?.coordinates ?? [];
  if (typeof lat !== "number" || typeof lon !== "number") return null;
  const streetLine = p.housenumber && p.street ? `${p.housenumber} ${p.street}` : (p.street ?? p.name ?? "");
  if (!streetLine) return null;
  const head = p.name && p.street && p.name !== p.street ? [p.name, streetLine] : [streetLine];
  const tail = [p.district, p.city, p.county, p.state, p.postcode, p.country].filter((x): x is string => Boolean(x));
  const display_name = [...head, ...tail].join(", ");
  return {
    display_name,
    short_name: shortAddressFromDetails(display_name, { house_number: p.housenumber, road: p.street ?? p.name, suburb: p.district, city: p.city }) || formatAddress(display_name),
    lat,
    lon,
  };
}
