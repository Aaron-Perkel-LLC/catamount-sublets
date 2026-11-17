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

  // Rounding the center to 5 decimals moves it by at most ~0.7 m (0.56 m of latitude, 0.4 m of longitude here).
  const ROUNDING_M = 0.7;
  const NEAREST = PUBLIC_AREA.minOffsetM - HALF_DIAGONAL - ROUNDING_M; // 23.9 m
  const FURTHEST = PUBLIC_AREA.maxOffsetM + HALF_DIAGONAL + ROUNDING_M; // 146.1 m

  it("is configured so the true point is never near the middle and always inside", () => {
    expect(PUBLIC_AREA.minOffsetM - HALF_DIAGONAL).toBeCloseTo(24.6, 1);
    expect(PUBLIC_AREA.maxOffsetM + HALF_DIAGONAL).toBeCloseTo(145.4, 1);
    expect(FURTHEST).toBeLessThan(PUBLIC_AREA.radiusM);
  });

  it("keeps every point of a cell, corners and edges included, 24.6–145.4 m from the center, for 500 cells", () => {
    let min = Infinity;
    let max = 0;
    for (const p of places(500)) {
      const cell = gridCell(p.lat, p.lon);
      const lo = cellCenter({ row: cell.row - 0.5, col: cell.col - 0.5 }); // the cell's south-west corner
      const hi = cellCenter({ row: cell.row + 0.5, col: cell.col + 0.5 }); // its north-east corner (the next cell's)
      const inset = 1e-9; // a hair inside, so the north and east edges still belong to this cell
      const lats = [lo.lat + inset, (lo.lat + hi.lat) / 2, hi.lat - inset];
      const lons = [lo.lon + inset, (lo.lon + hi.lon) / 2, hi.lon - inset];
      const points = lats.flatMap((lat) => lons.map((lon) => ({ lat, lon }))); // 4 corners, 4 edge midpoints, the center
      for (let i = 0; i < 40; i++) {
        const f = (i * 0.618034 + 0.05) % 1; // scattered over the cell, never on its edge
        const g = (i * 0.381966 + 0.13) % 1;
        points.push({ lat: lats[0] + f * (lats[2] - lats[0]), lon: lons[0] + g * (lons[2] - lons[0]) });
      }
      const area = fuzzedArea(p.lat, p.lon);
      for (const q of points) {
        expect(gridCell(q.lat, q.lon)).toEqual(cell);
        expect(fuzzedArea(q.lat, q.lon)).toEqual(area);
        const d = metersBetween(area.lat, area.lon, q.lat, q.lon);
        min = Math.min(min, d);
        max = Math.max(max, d);
        expect(d).toBeGreaterThanOrEqual(NEAREST);
        expect(d).toBeLessThanOrEqual(FURTHEST);
      }
    }
    expect(min).toBeGreaterThan(24 - ROUNDING_M);
    expect(max).toBeLessThan(PUBLIC_AREA.radiusM);
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
