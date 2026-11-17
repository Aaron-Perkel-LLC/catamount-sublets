import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { neighborhoodAt } from "@/lib/neighborhood";
import { NEIGHBORHOODS } from "./neighborhoods";

describe("neighborhoods", () => {
  it("match the reviewed GeoJSON in docs/neighborhoods", () => {
    const fc = JSON.parse(readFileSync(path.join(process.cwd(), "docs/neighborhoods/neighborhoods.geojson"), "utf8")) as {
      features: { properties: { name: string }; geometry: { coordinates: number[][][] } }[];
    };
    expect(NEIGHBORHOODS.map((n) => n.name)).toEqual(fc.features.map((f) => f.properties.name));
    for (const [i, f] of fc.features.entries()) expect(NEIGHBORHOODS[i].ring).toEqual(f.geometry.coordinates[0]);
  });

  // The spot checks Aaron approved on 16 Nov 2026.
  it.each([
    ["Church St at City Hall Park", 44.47655, -73.2125, "Downtown"],
    ["North St at N Winooski Ave", 44.48482, -73.21146, "Old North End"],
    ["Buell St at S Union", 44.4791, -73.20919, "Downtown"],
    ["S Williams at College St", 44.47762, -73.20308, "Downtown"],
    ["Main St just west of S Prospect", 44.47634, -73.20106, "Downtown"],
    ["Summit St just south of Maple", 44.47379, -73.20222, "Hill Section"],
    ["Pine St at Maltex", 44.46278, -73.21468, "South End"],
    ["Campus green", 44.47851, -73.19991, "University District"],
    ["Mansfield Ave at Loomis", 44.4835, -73.19921, "University District"],
    ["Redstone campus", 44.47, -73.195, "University District"],
    ["Country Club Rd", 44.46395, -73.19721, "Hill Section"],
    ["Shelburne Rd 20 m west of Flynn", 44.45513, -73.20884, "South End"],
    ["North Ave at Ethan Allen Pkwy", 44.50384, -73.24066, "New North End"],
    ["Winooski rotary", 44.4914, -73.1857, "Winooski"],
    ["Dorset St, South Burlington", 44.46409, -73.18076, "Burlington area"],
  ])("%s is %s", (_name, lat, lon, area) => {
    expect(neighborhoodAt(lat, lon)).toBe(area);
  });
});
