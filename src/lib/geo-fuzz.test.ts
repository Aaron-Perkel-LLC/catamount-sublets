import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { PUBLIC_AREA } from "@/config/site";
import { fuzzedArea } from "@/server/geo-fuzz";
import { areaFromKey, cellCenter, circleRing, gridCell, metersBetween, offsetPoint } from "./geo-fuzz";

const TRUE = { lat: 44.4762, lon: -73.2106 };
const HALF_DIAGONAL = (PUBLIC_AREA.gridM * Math.SQRT2) / 2;

/** A deterministic spread of places over Burlington (about 4 km square). */
function places(n: number): { lat: number; lon: number }[] {
  let x = 12345;
  const next = () => (x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  return Array.from({ length: n }, () => ({ lat: 44.455 + next() * 0.04, lon: -73.235 + next() * 0.05 }));
}

describe("geo fuzz", () => {
  it("is configured so the circle always contains the place", () => {
    expect(PUBLIC_AREA.maxOffsetM + HALF_DIAGONAL).toBeLessThan(PUBLIC_AREA.radiusM - 2);
  });

  it("is stable for a place across calls", () => {
    expect(fuzzedArea(TRUE.lat, TRUE.lon)).toEqual(fuzzedArea(TRUE.lat, TRUE.lon));
  });

  it("gives every point in one grid cell the same circle (one house, geocoded a few metres apart)", () => {
    const c = cellCenter(gridCell(TRUE.lat, TRUE.lon));
    const area = fuzzedArea(c.lat, c.lon);
    for (let i = 0; i < 16; i++) {
      const p = offsetPoint(c.lat, c.lon, (i / 16) * 2 * Math.PI, 3 + (i % 4) * 5); // 3–18 m from the center, inside the 50 m cell
      expect(gridCell(p.lat, p.lon)).toEqual(gridCell(c.lat, c.lon));
      expect(fuzzedArea(p.lat, p.lon)).toEqual(area);
    }
  });

  it("gives a place in another cell a new circle (a moved listing)", () => {
    const moved = offsetPoint(TRUE.lat, TRUE.lon, 0.3, 120);
    expect(gridCell(moved.lat, moved.lon)).not.toEqual(gridCell(TRUE.lat, TRUE.lon));
    expect(fuzzedArea(moved.lat, moved.lon)).not.toEqual(fuzzedArea(TRUE.lat, TRUE.lon));
  });

  it("keeps the true point inside the circle, for 10,000 places", () => {
    let min = Infinity;
    let max = 0;
    for (const p of places(10_000)) {
      const a = fuzzedArea(p.lat, p.lon);
      const d = metersBetween(a.lat, a.lon, p.lat, p.lon);
      min = Math.min(min, d);
      max = Math.max(max, d);
    }
    expect(max).toBeLessThan(PUBLIC_AREA.maxOffsetM + HALF_DIAGONAL + 2); // the 5-decimal rounding moves it by at most ~1 m
    expect(max).toBeLessThan(PUBLIC_AREA.radiusM);
    expect(min).toBeGreaterThan(PUBLIC_AREA.minOffsetM - HALF_DIAGONAL - 2);
  });

  it("offsets different cells differently, spread in every direction", () => {
    const seen = new Set<string>();
    const cells = new Set<string>();
    const quadrants = [0, 0, 0, 0];
    for (const p of places(3000)) {
      const cell = gridCell(p.lat, p.lon);
      if (cells.has(`${cell.row}:${cell.col}`)) continue; // one sample per cell
      cells.add(`${cell.row}:${cell.col}`);
      if (cells.size > 2000) break;
      const c = cellCenter(cell);
      const a = fuzzedArea(p.lat, p.lon);
      seen.add(`${(a.lat - c.lat).toFixed(5)},${(a.lon - c.lon).toFixed(5)}`);
      quadrants[(a.lat > c.lat ? 0 : 2) + (a.lon > c.lon ? 0 : 1)]++;
    }
    expect(cells.size).toBe(2001);
    // Offsets are rounded to about a metre over a ~33,000 m² ring, so by the birthday bound ~60 of 2,000 coincide.
    expect(seen.size).toBeGreaterThan(1880);
    for (const q of quadrants) expect(q).toBeGreaterThan(400);
  });

  it("depends on the secret, not only the cell", () => {
    const key = (secret: string) => createHmac("sha256", secret).update("geo-fuzz-cell:1:2").digest();
    expect(areaFromKey(TRUE.lat, TRUE.lon, key("one"))).not.toEqual(areaFromKey(TRUE.lat, TRUE.lon, key("two")));
  });

  it("draws a closed ring at the radius", () => {
    const area = fuzzedArea(TRUE.lat, TRUE.lon);
    const ring = circleRing(area);
    expect(ring[0]).toEqual(ring.at(-1));
    for (const [lon, lat] of ring) expect(Math.abs(metersBetween(area.lat, area.lon, lat, lon) - PUBLIC_AREA.radiusM)).toBeLessThan(1);
  });
});
