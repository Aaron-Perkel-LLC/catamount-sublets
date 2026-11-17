import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { PUBLIC_AREA } from "@/config/site";
import { fuzzedArea } from "@/server/geo-fuzz";
import { areaFromKey, circleRing, metersBetween } from "./geo-fuzz";

const TRUE = { lat: 44.4762, lon: -73.2106 };

describe("geo fuzz", () => {
  it("is stable for a listing across calls", () => {
    expect(fuzzedArea(42, TRUE.lat, TRUE.lon)).toEqual(fuzzedArea(42, TRUE.lat, TRUE.lon));
  });

  it("keeps the true point inside the circle and off its center, for 10,000 listings", () => {
    let min = Infinity;
    let max = 0;
    for (let id = 1; id <= 10_000; id++) {
      const a = fuzzedArea(id, TRUE.lat, TRUE.lon);
      const d = metersBetween(a.lat, a.lon, TRUE.lat, TRUE.lon);
      min = Math.min(min, d);
      max = Math.max(max, d);
    }
    expect(min).toBeGreaterThan(PUBLIC_AREA.minOffsetM - 2); // the 5-decimal rounding moves it by at most ~1 m
    expect(max).toBeLessThan(PUBLIC_AREA.maxOffsetM + 2);
    expect(max).toBeLessThan(PUBLIC_AREA.radiusM);
  });

  it("gives different listings different offsets, spread in every direction", () => {
    const seen = new Set<string>();
    const quadrants = [0, 0, 0, 0];
    for (let id = 1; id <= 2000; id++) {
      const a = fuzzedArea(id, TRUE.lat, TRUE.lon);
      seen.add(`${a.lat},${a.lon}`);
      quadrants[(a.lat > TRUE.lat ? 0 : 2) + (a.lon > TRUE.lon ? 0 : 1)]++;
    }
    // Centers are rounded to about a metre over a ~33,000 m² ring, so by the birthday bound ~50 of 2,000 share a cell.
    expect(seen.size).toBeGreaterThan(1880);
    for (const q of quadrants) expect(q).toBeGreaterThan(400);
  });

  it("depends on the secret, not only the id", () => {
    const key = (secret: string) => createHmac("sha256", secret).update("geo-fuzz:7").digest();
    expect(areaFromKey(TRUE.lat, TRUE.lon, key("one"))).not.toEqual(areaFromKey(TRUE.lat, TRUE.lon, key("two")));
  });

  it("draws a closed ring at the radius", () => {
    const area = fuzzedArea(3, TRUE.lat, TRUE.lon);
    const ring = circleRing(area);
    expect(ring[0]).toEqual(ring.at(-1));
    for (const [lon, lat] of ring) expect(Math.abs(metersBetween(area.lat, area.lon, lat, lon) - PUBLIC_AREA.radiusM)).toBeLessThan(1);
  });
});
