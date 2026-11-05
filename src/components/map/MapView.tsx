"use client";

import {
  AttributionControl,
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
import { track } from "@/lib/track";
import type { ListingDto } from "@/server/data/listings";
import { preloadPhoto } from "../listings/Gallery";
import { useListingView } from "../listings/listing-view";
import { fallbackStyle, foldAttribution, loadMapStyle, MAP_MAX_ZOOM, watchVectorMap, webglAvailable } from "./basemap";
import { pointMapLibreAtServedWorker } from "./worker";

pointMapLibreAtServedWorker();

/**
 * The Map page's map. The map instance lives for the page; markers are
 * rebuilt whenever the listings change (a filter). Listings within about
 * 10 m share one pin showing the lowest rent and a count, and its popup
 * stacks them, cheapest first.
 */
export default function MapView({ listings }: { listings: ListingDto[] }) {
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

    const groups = new Map<string, ListingDto[]>();
    for (const l of listings) {
      const key = pinGroupKey(l.lat, l.lon);
      groups.set(key, [...(groups.get(key) ?? []), l]);
    }
    const bounds = new LngLatBounds();
    bounds.extend([CAMPUS.lon, CAMPUS.lat]);

    for (const group of groups.values()) {
      group.sort((a, b) => a.price - b.price);
      const first = group[0];
      const label =
        group.length > 1
          ? `${group.length} listings from ${formatMoney(first.price)} a month`
          : `${formatMoney(first.price)} a month, ${first.shortAddress}`;

      const el = document.createElement("div");
      el.className = "price-pin";
      el.setAttribute("role", "button");
      el.setAttribute("aria-label", label);
      el.tabIndex = 0;
      const tag = document.createElement("span");
      tag.className = "price-pin-tag";
      const price = document.createElement("span");
      price.textContent = formatMoney(first.price);
      tag.appendChild(price);
      if (group.length > 1) {
        const count = document.createElement("span");
        count.className = "price-pin-count";
        count.textContent = String(group.length);
        tag.appendChild(count);
      }
      el.appendChild(tag);

      const popup = new Popup({ offset: 36, closeButton: true, maxWidth: "260px", anchor: "bottom", className: "listing-popup" }).setDOMContent(
        popupContent(group, (l) => openRef.current(l, "map")),
      );
      const marker = new Marker({ element: el, anchor: "bottom" }).setLngLat([first.lon, first.lat]).setPopup(popup).addTo(map);
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
      bounds.extend([first.lon, first.lat]);
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
function boundsOf(listings: ListingDto[]): LngLatBounds | null {
  if (listings.length === 0) return null;
  const b = new LngLatBounds();
  b.extend([CAMPUS.lon, CAMPUS.lat]);
  for (const l of listings) b.extend([l.lon, l.lat]);
  return b;
}

/** One pin's popup: each listing's thumbnail, price, address, size, semester and a View button. */
function popupContent(group: ListingDto[], onOpen: (l: ListingDto) => void): HTMLElement {
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
    price.textContent = `${formatMoney(l.price)}/mo${l.priceNegotiable ? " · or best offer" : ""}`;
    entry.appendChild(price);
    const addr = document.createElement("div");
    addr.className = "popup-address";
    addr.textContent = l.shortAddress;
    entry.appendChild(addr);
    if (l.sizeSummary) {
      const size = document.createElement("div");
      size.className = "popup-size";
      size.textContent = l.sizeSummary;
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
