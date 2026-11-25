"use client";

import {
  AttributionControl,
  type GeoJSONSource,
  LngLatBounds,
  Map as MlMap,
  Marker,
  NavigationControl,
  Popup,
  ScaleControl,
  type StyleSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { CAMPUS } from "@/config/site";
import { pinGroupKey } from "@/lib/distance";
import { formatMoney } from "@/lib/format";
import { isMultiRoom, priceLines, roomsChip } from "@/lib/price";
import { circleRing } from "@/lib/geo-fuzz";
import { track } from "@/lib/track";
import { type BoardListing, headingOf, isPublicListing, pointOf } from "../listings/board-listing";
import { preloadPhoto } from "../listings/Gallery";
import { useListingView } from "../listings/listing-view";
import { fallbackStyle, foldAttribution, loadMapStyle, MAP_MAX_ZOOM, watchVectorMap, webglAvailable } from "./basemap";
import { pointMapLibreAtServedWorker } from "./worker";

pointMapLibreAtServedWorker();

/**
 * The Map page's map. The map instance lives for the page; markers are
 * rebuilt whenever the listings change (a filter). Listings within about
 * 10 m share one pin showing the lowest rent and a count, and its popup
 * stacks them, cheapest first. Signed out, each listing is its approximate
 * area instead: a circle with the price tag in its middle, pointing at
 * nothing (PublicListing has no true point to point at).
 */
export default function MapView({ listings }: { listings: BoardListing[] }) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const { open } = useListingView();
  const openRef = useRef(open);
  const listingsRef = useRef(listings);
  useEffect(() => {
    listingsRef.current = listings;
  }, [listings]);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  // The map itself, once. The vector style is awaited first (its fetch began
  // in MapViewLoader, alongside this chunk's download) so the map is built
  // once, with the right style; the raster is only ever a fallback. Starting
  // on the raster and swapping used to cost a dozen tiles and a style rebuild.
  const [mapReady, setMapReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const firstFit = useRef(true);
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    let cancelled = false;
    let map: MlMap | null = null;
    let stopWatching: (() => void) | undefined;

    const build = (style: StyleSpecification, vector: boolean) => {
      if (cancelled) return;
      // Open straight on the listings, so the first tiles fetched are the ones kept.
      const initial = boundsOf(listingsRef.current);
      try {
        map = new MlMap({
          container: el,
          style,
          ...(initial ? { bounds: initial, fitBoundsOptions: FIT } : { center: [CAMPUS.lon, CAMPUS.lat], zoom: 14 }),
          maxZoom: MAP_MAX_ZOOM,
          attributionControl: false,
        });
      } catch {
        // No WebGL2: say so instead of taking the page down.
        setFailed(true);
        return;
      }
      mapRef.current = map;
      map.addControl(new NavigationControl({ showCompass: false }), "top-right");
      map.addControl(new ScaleControl({ unit: "imperial" }), "bottom-left");
      map.addControl(new AttributionControl({ compact: true }), "bottom-right");
      foldAttribution(map);
      // The circles are a map layer, so a style swap (the raster fallback) drops them: draw them again.
      const built = map;
      built.on("style.load", () => drawAreas(built, listingsRef.current));
      built.on("load", () => drawAreas(built, listingsRef.current));
      const campusEl = document.createElement("div");
      campusEl.className = "campus-pin";
      campusEl.title = "Campus";
      new Marker({ element: campusEl }).setLngLat([CAMPUS.lon, CAMPUS.lat]).addTo(map);
      setMapReady(true);

      if (vector) stopWatching = watchVectorMap(map);
    };

    if (webglAvailable()) {
      loadMapStyle()
        .then((style) => build(style, true))
        .catch(() => build(fallbackStyle(), false));
    } else {
      build(fallbackStyle(), false);
    }

    return () => {
      cancelled = true;
      stopWatching?.();
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  // Pins, rebuilt on every change to the listings, and once the map exists.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const m of markers.current) m.remove();
    markers.current = [];

    if (map.isStyleLoaded()) drawAreas(map, listings);
    const groups = new Map<string, BoardListing[]>();
    for (const l of listings) {
      const p = pointOf(l);
      const key = pinGroupKey(p.lat, p.lon);
      groups.set(key, [...(groups.get(key) ?? []), l]);
    }
    const bounds = new LngLatBounds();
    bounds.extend([CAMPUS.lon, CAMPUS.lat]);

    for (const group of groups.values()) {
      // Cheapest per room first, as the price sort and filter compare them.
      group.sort((a, b) => a.pricePerRoom - b.pricePerRoom);
      const first = group[0];
      const at = pointOf(first);
      const area = isPublicListing(first);
      const firstPrice = priceLines(first);
      const label =
        group.length > 1
          ? `${group.length} listings from ${formatMoney(first.pricePerRoom)} a ${isMultiRoom(first) ? "room" : "month"}`
          : `${firstPrice.sub ? firstPrice.text : `${firstPrice.main} a month`}, ${headingOf(first)}`;

      const el = document.createElement("div");
      el.className = area ? "price-pin is-area" : "price-pin";
      el.setAttribute("role", "button");
      el.setAttribute("aria-label", label);
      el.tabIndex = 0;
      const tag = document.createElement("span");
      tag.className = "price-pin-tag";
      const price = document.createElement("span");
      price.textContent = firstPrice.pin;
      tag.appendChild(price);
      if (group.length > 1) {
        const count = document.createElement("span");
        count.className = "price-pin-count";
        count.textContent = String(group.length);
        tag.appendChild(count);
      }
      el.appendChild(tag);

      const popup = new Popup({ offset: area ? 18 : 36, closeButton: true, maxWidth: "260px", anchor: "bottom", className: "listing-popup" }).setDOMContent(
        popupContent(group, (l) => openRef.current(l, "map")),
      );
      const marker = new Marker({ element: el, anchor: area ? "center" : "bottom" }).setLngLat([at.lon, at.lat]).setPopup(popup).addTo(map);
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          marker.togglePopup();
        }
      });
      popup.on("open", () => {
        el.classList.add("is-active");
        el.style.zIndex = "10";
        // Bring the pin and its popup to the middle together, so the popup is never cut off at the top.
        const h = popup.getElement()?.offsetHeight ?? 0;
        const room = map.getContainer().clientHeight / 2 - 24;
        map.easeTo({ center: marker.getLngLat(), offset: [0, Math.max(0, Math.min((h + 36) / 2, room))], duration: 300 });
        for (const l of group) track("map_pin_open", l.id, "map");
        preloadPhoto(first.photos[0]?.display);
      });
      popup.on("close", () => {
        el.classList.remove("is-active");
        el.style.zIndex = "";
      });
      markers.current.push(marker);
      bounds.extend([at.lon, at.lat]);
    }

    if (listings.length > 0 && !firstFit.current) {
      map.fitBounds(bounds, { ...FIT, duration: 300 });
    }
    firstFit.current = false; // the map opened on these bounds already; later filter changes animate
  }, [listings, mapReady]);

  if (failed) {
    return (
      <div className="rounded-xl border border-line bg-paper px-6 py-10 text-center">
        <p className="font-bold">The map can’t load in this browser.</p>
        <p className="text-sm text-ink-2">Every listing is on the List view, with its distance from campus.</p>
      </div>
    );
  }

  return (
    <div className="relative h-[70dvh] min-h-[420px] w-full overflow-hidden rounded-xl border border-line">
      <div ref={container} className="h-full w-full" />
      {listings.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-xl border border-line bg-paper/95 px-6 py-5 text-center shadow">
            <p className="font-bold">No sublets to show here.</p>
            <p className="text-sm text-ink-2">Widen the filters above, or switch to Browse.</p>
          </div>
        </div>
      )}
    </div>
  );
}

/** More room at the top than the bottom: a tag stands above its point. */
// Room for a price tag on every side, and on the right for the zoom buttons, so no pin opens hidden under them.
const FIT = { padding: { top: 70, left: 60, right: 90, bottom: 50 }, maxZoom: 16 };

/** Campus plus every listing, or null when there are none. */
function boundsOf(listings: BoardListing[]): LngLatBounds | null {
  if (listings.length === 0) return null;
  const b = new LngLatBounds();
  b.extend([CAMPUS.lon, CAMPUS.lat]);
  for (const l of listings) {
    const p = pointOf(l);
    b.extend([p.lon, p.lat]);
  }
  return b;
}

const AREAS = "public-areas";
/** The lake token by hand: a GL style cannot read CSS variables (see MAP_COLOURS in ./basemap). */
const AREA_COLOUR = "#1D4F73";

/** The approximate-area circles, one per public listing; nothing at all for a signed-in map. */
function drawAreas(map: MlMap, listings: BoardListing[]) {
  const features = listings.filter(isPublicListing).map((l) => ({
    type: "Feature" as const,
    properties: { id: l.id },
    geometry: { type: "Polygon" as const, coordinates: [circleRing(l.area)] },
  }));
  const source = map.getSource(AREAS) as GeoJSONSource | undefined;
  const data = { type: "FeatureCollection" as const, features };
  try {
    if (source) {
      source.setData(data);
      return;
    }
    if (features.length === 0) return;
    map.addSource(AREAS, { type: "geojson", data });
    map.addLayer({ id: `${AREAS}-fill`, type: "fill", source: AREAS, paint: { "fill-color": AREA_COLOUR, "fill-opacity": 0.14 } });
    map.addLayer({ id: `${AREAS}-line`, type: "line", source: AREAS, paint: { "line-color": AREA_COLOUR, "line-width": 1.5, "line-opacity": 0.6 } });
  } catch {
    // The style is mid-swap; its "style.load" draws them again.
  }
}

/** One pin's popup: each listing's thumbnail, price, heading (address, or the public title), size, semester and a View button. */
function popupContent(group: BoardListing[], onOpen: (l: BoardListing) => void): HTMLElement {
  const root = document.createElement("div");
  root.className = "map-popup";
  if (group.length > 1) {
    const h = document.createElement("div");
    h.className = "map-popup-heading";
    h.textContent = `${group.length} listings here`;
    root.appendChild(h);
    root.classList.add("map-popup-group");
  }
  for (const l of group) {
    const entry = document.createElement("div");
    entry.className = "map-popup-entry";
    const thumb = l.photos[0]?.thumb ?? l.photos[0]?.display;
    if (thumb) {
      const img = document.createElement("img");
      img.src = thumb;
      img.alt = "";
      img.onerror = () => (img.style.display = "none");
      img.addEventListener("click", () => onOpen(l));
      entry.appendChild(img);
    }
    const price = document.createElement("div");
    price.className = "popup-price";
    price.textContent = `${priceLines(l).text}${l.priceNegotiable ? " · or best offer" : ""}`;
    entry.appendChild(price);
    const addr = document.createElement("div");
    addr.className = "popup-address";
    addr.textContent = headingOf(l);
    entry.appendChild(addr);
    const sizeText = [roomsChip(l), l.sizeSummary].filter(Boolean).join(" · ");
    if (sizeText) {
      const size = document.createElement("div");
      size.className = "popup-size";
      size.textContent = sizeText;
      entry.appendChild(size);
    }
    const sem = document.createElement("div");
    sem.className = "popup-semester";
    sem.textContent = l.semesterLabel;
    entry.appendChild(sem);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "popup-btn";
    btn.textContent = "View listing";
    btn.addEventListener("click", () => onOpen(l));
    entry.appendChild(btn);
    root.appendChild(entry);
  }
  return root;
}
