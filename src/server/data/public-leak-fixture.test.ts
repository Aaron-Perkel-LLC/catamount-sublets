import { describe, expect, it } from "vitest";
import { coordinateLeaks, leaks, SECRET } from "./public-leak-fixture";

/**
 * The coordinate rule both leak checks use: a true point leaks when either
 * coordinate appears outside the public listings' own areas, or when one of
 * those areas holds both. Another listing's area sharing one coordinate by
 * chance is not a leak; an area that isn't a public listing's excuses nothing.
 */
const hidden = { lat: 44.4812341, lon: -73.2187652 };
const card = (id: number, area: { lat: number; lon: number }) => ({ id, price: 900, neighborhood: "Old North End", area: { ...area, radiusM: 150 } });
/** How the board's RSC payload sits inside the HTML: JSON escaped in a script string. */
const inHtml = (v: unknown) => `<script>self.__next_f.push([1,${JSON.stringify(JSON.stringify(v))}])</script>`;

describe("coordinateLeaks", () => {
  // #234's area shares #233's latitude to five decimals, 1.7 km away (17 Nov 2026 on production).
  const area234 = { lat: 44.48123419876, lon: -73.19731 };

  it("a public listing's area that shares only the hidden listing's latitude is not a leak", () => {
    expect(coordinateLeaks(JSON.stringify(card(234, area234)), hidden, [area234])).toEqual([]);
    expect(coordinateLeaks(inHtml(card(234, area234)), hidden, [area234])).toEqual([]);
  });

  it("nor is the latitude in one public area and the longitude in another", () => {
    const area240 = { lat: 44.47001, lon: -73.21876521 };
    const body = JSON.stringify([card(234, area234), card(240, area240)]);
    expect(coordinateLeaks(body, hidden, [area234, area240])).toEqual([]);
  });

  it("an area that isn't a public listing's excuses nothing, even with one true coordinate", () => {
    expect(coordinateLeaks(JSON.stringify(card(233, { lat: hidden.lat, lon: -73.19731 })), hidden, [area234])).toEqual(["lat"]);
    expect(coordinateLeaks(JSON.stringify(card(234, area234)), hidden)).toEqual(["lat"]); // no known areas: strict
  });

  it("a public area centred on the true point is a leak", () => {
    expect(coordinateLeaks(JSON.stringify(card(233, hidden)), hidden, [hidden])).toEqual(["lat", "lon"]);
    expect(coordinateLeaks(inHtml(card(233, hidden)), hidden, [hidden])).toEqual(["lat", "lon"]);
  });

  it("a lone coordinate outside the areas is a leak", () => {
    expect(coordinateLeaks(JSON.stringify({ id: 233, lat: hidden.lat }), hidden, [area234])).toEqual(["lat"]);
    expect(coordinateLeaks(`<a href="https://maps.example/?q=${hidden.lon.toFixed(5)}">map</a>`, hidden)).toEqual(["lon"]);
    expect(coordinateLeaks(inHtml({ point: { lat: hidden.lat } }), hidden)).toEqual(["lat"]);
    expect(coordinateLeaks(JSON.stringify({ truePoint: { lat: hidden.lat, lon: -73.1, radiusM: 150 } }), hidden, [area234])).toEqual(["lat"]);
  });

  it("finds a coordinate however it is printed", () => {
    const short = { lat: 44.4762, lon: -73.2121 };
    expect(coordinateLeaks('{"id":1,"lat":44.4762,"lon":-73.2121}', short)).toEqual(["lat", "lon"]);
    expect(coordinateLeaks('{"lat":44.47620,"lon":-73.21210}', short)).toEqual(["lat", "lon"]);
    // …but a short one doesn't match a longer, different number.
    expect(coordinateLeaks('{"lat":44.47625}', short)).toEqual([]);
    // Seven decimals printed to six, rounding up in the sixth.
    expect(coordinateLeaks('{"lat":44.481236}', { lat: 44.4812361, lon: -73 })).toEqual(["lat"]);
    expect(coordinateLeaks('{"lat":44.48124}', { lat: 44.4812361, lon: -73 })).toEqual(["lat"]);
  });

  it("recognises an area whatever its key order or escaping", () => {
    const area = { lat: hidden.lat, lon: -73.19731 };
    const reordered = `{"area":{"radiusM":150,"lon":${area.lon},"lat":${area.lat}}}`;
    expect(coordinateLeaks(reordered, hidden, [area])).toEqual([]);
    expect(coordinateLeaks(reordered.replaceAll('"', "&quot;"), hidden, [area])).toEqual([]);
  });

  it("nothing of the point, nothing found", () => {
    expect(coordinateLeaks(JSON.stringify(card(1, { lat: 44.47, lon: -73.2 })), hidden)).toEqual([]);
  });
});

describe("leaks", () => {
  it("reads the fixture's true point with the same rule", () => {
    const other = { lat: SECRET.lat, lon: -73.19731 };
    expect(leaks(JSON.stringify(card(2, other)), [other])).toEqual([]);
    expect(leaks(JSON.stringify(card(2, other)))).toEqual(["true lat"]);
    expect(leaks(JSON.stringify(card(1, { lat: SECRET.lat, lon: SECRET.lon })), [{ lat: SECRET.lat, lon: SECRET.lon }])).toEqual(["true lat", "true lon"]);
    expect(leaks(`near ${SECRET.lat}`)).toEqual(["true lat"]);
  });
});
