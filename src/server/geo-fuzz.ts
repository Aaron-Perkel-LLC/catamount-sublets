import { createHmac } from "node:crypto";
import { type Area, areaFromKey } from "@/lib/geo-fuzz";
import { appSecret } from "@/lib/share";

/**
 * The approximate area shown to signed-out visitors: a fixed offset of the
 * true point keyed by HMAC(APP_SECRET, "geo-fuzz:" + id). Deterministic, so
 * there is no jitter between loads to average away; secret, so the offset
 * cannot be undone. Domain-separated from share tokens ("sublet:") and actor
 * keys ("actor:").
 */
export function fuzzedArea(listingId: number, lat: number, lon: number): Area {
  const key = createHmac("sha256", appSecret()).update(`geo-fuzz:${listingId}`).digest();
  return areaFromKey(lat, lon, key);
}
