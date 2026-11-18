import { describe, expect, it } from "vitest";
import { coordinateLeaks, leaks, SECRET } from "./public-leak-fixture";

/**
 * The coordinate rule both leak checks use: a true point leaks when both of
 * its coordinates appear, or either appears outside the public area fields.
 */
const hidden = { lat: 44.4812341, lon: -73.2187652 };
const card = (area: { lat: number; lon: number }) => ({ id: 234, price: 900, neighborhood: "Old North End", area: { ...area, radiusM: 150 } });
/** How the board's RSC payload sits inside the HTML: JSON escaped in a script string. */
const inHtml = (v: unknown) => `<script>self.__next_f.push([1,${JSON.stringify(JSON.stringify(v))}])</script>`;

describe("coordinateLeaks", () => {
  it("a public area that shares only the hidden listing's latitude (another listing 1.7 km away) is not a leak", () => {
    const other = card({ lat: 44.48123419876, lon: -73.19731 });
    expect(coordinateLeaks(JSON.stringify(other), hidden)).toEqual([]);
    expect(coordinateLeaks(inHtml(other), hidden)).toEqual([]);
  });

  it("likewise a shared longitude", () => {
    expect(coordinateLeaks(JSON.stringify(card({ lat: 44.49001, lon: -73.21877001 })), hidden)).toEqual([]);
  });

  it("an area centred on the true point is a leak", () => {
    expect(coordinateLeaks(JSON.stringify(card(hidden)), hidden)).toEqual(["lat", "lon"]);
    expect(coordinateLeaks(inHtml(card(hidden)), hidden)).toEqual(["lat", "lon"]);
  });

  it("both coordinates anywhere in the response are a leak, even apart", () => {
    const body = `${JSON.stringify(card({ lat: hidden.lat, lon: -73.19731 }))}<p>${hidden.lon.toFixed(5)}</p>`;
    expect(coordinateLeaks(body, hidden)).toEqual(["lat", "lon"]);
  });

  it("a lone coordinate outside the area fields is a leak", () => {
    expect(coordinateLeaks(JSON.stringify({ id: 233, lat: hidden.lat }), hidden)).toEqual(["lat"]);
    expect(coordinateLeaks(`<a href="https://maps.example/?q=${hidden.lon.toFixed(5)}">map</a>`, hidden)).toEqual(["lon"]);
    expect(coordinateLeaks(inHtml({ point: { lat: hidden.lat } }), hidden)).toEqual(["lat"]);
  });

  it("an area-shaped object under another key is not let off", () => {
    expect(coordinateLeaks(JSON.stringify({ truePoint: { lat: hidden.lat, lon: -73.1, radiusM: 150 } }), hidden)).toEqual(["lat"]);
  });

  it("nothing of the point, nothing found", () => {
    expect(coordinateLeaks(JSON.stringify(card({ lat: 44.47, lon: -73.2 })), hidden)).toEqual([]);
  });
});

describe("leaks", () => {
  it("reads the fixture's true point with the same rule", () => {
    expect(leaks(JSON.stringify(card({ lat: SECRET.lat, lon: -73.19731 })))).toEqual([]);
    expect(leaks(JSON.stringify(card({ lat: SECRET.lat, lon: SECRET.lon })))).toEqual(["true lat", "true lon"]);
    expect(leaks(`near ${SECRET.lat}`)).toEqual(["true lat"]);
  });
});
