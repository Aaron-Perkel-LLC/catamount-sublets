"use client";

import { Map as MlMap, Marker, NavigationControl, type MapMouseEvent, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { CAMPUS } from "@/config/site";
import { fallbackStyle, foldAttribution, loadMapStyle, MAP_MAX_ZOOM, watchVectorMap, webglAvailable } from "../map/basemap";
import { pointMapLibreAtServedWorker } from "../map/worker";

pointMapLibreAtServedWorker();

/**
 * The post form's map: tap to place the pin, drag it to adjust. Two-finger
 * panning on touch screens, so the page scrolls past the map with one.
 *
 * Built like the Map page's: the vector style is awaited (its fetch began when
 * the form mounted) and the map is built once on it, raster underlay
 * included, with the raster taking over if no vector tile arrives. It used to
 * start on the raster and swap styles with no way back, so a vector map that
 * never drew left the picker blank.
 */
export default function PostMap({
  lat,
  lon,
  onPin,
}: {
  lat: number | null;
  lon: number | null;
  onPin: (lat: number, lon: number) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  // No WebGL2 (an old phone, a locked-down browser): no map, but the form still works.
  const [failed, setFailed] = useState(false);
  const pinRef = useRef<Marker | null>(null);
  const onPinRef = useRef(onPin);
  // The coordinates as of now, for a map built after the style arrives.
  const coordsRef = useRef({ lat, lon });
  useEffect(() => {
    onPinRef.current = onPin;
  }, [onPin]);
  useEffect(() => {
    coordsRef.current = { lat, lon };
  }, [lat, lon]);

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    let cancelled = false;
    let map: MlMap | null = null;
    let stopWatching: (() => void) | undefined;

    const build = (style: StyleSpecification, vector: boolean) => {
      if (cancelled) return;
      const { lat: la, lon: lo } = coordsRef.current;
      let m: MlMap;
      try {
        m = new MlMap({
        container: el,
        style,
        center: la !== null && lo !== null ? [lo, la] : [CAMPUS.lon, CAMPUS.lat],
        zoom: la !== null && lo !== null ? 16 : 14,
        maxZoom: MAP_MAX_ZOOM,
        cooperativeGestures: true,
        attributionControl: { compact: true },
        });
      } catch {
        setFailed(true);
        return;
      }
      map = m;
      mapRef.current = m;
      foldAttribution(m);
      m.addControl(new NavigationControl({ showCompass: false }), "top-right");

      const campus = document.createElement("div");
      campus.className = "campus-pin";
      campus.title = "Campus";
      new Marker({ element: campus }).setLngLat([CAMPUS.lon, CAMPUS.lat]).addTo(m);

      if (la !== null && lo !== null) placePin(m, pinRef, onPinRef, lo, la);
      m.on("click", (e: MapMouseEvent) => {
        placePin(m, pinRef, onPinRef, e.lngLat.lng, e.lngLat.lat);
        onPinRef.current(round6(e.lngLat.lat), round6(e.lngLat.lng));
      });

      if (vector) stopWatching = watchVectorMap(m);
    };

    if (webglAvailable()) {
      loadMapStyle()
        .then((style) => build(style, true))
        .catch(() => build(fallbackStyle(), false));
    } else {
      build(fallbackStyle(), false); // throws without WebGL2; build() turns that into the note below
    }

    return () => {
      cancelled = true;
      stopWatching?.();
      map?.remove();
      mapRef.current = null;
      pinRef.current = null;
    };
  }, []);

  // A picked suggestion moves the pin and recentres. Before the map exists,
  // build() reads the same coordinates from coordsRef instead.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || lat === null || lon === null) return;
    const current = pinRef.current?.getLngLat();
    if (current && Math.abs(current.lat - lat) < 1e-7 && Math.abs(current.lng - lon) < 1e-7) return;
    placePin(map, pinRef, onPinRef, lon, lat);
    map.easeTo({ center: [lon, lat], zoom: Math.max(map.getZoom(), 16), duration: 300 });
  }, [lat, lon]);

  if (failed) {
    return (
      <p className="rounded-xl border border-line bg-paper px-4 py-3 text-sm text-ink-2">
        The map can’t load in this browser. Pick your address from the suggestions above; that places your listing on the map.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div ref={container} className="h-72 w-full overflow-hidden rounded-xl border border-line" />
      <p className="text-xs text-ink-3">
        {lat === null ? "Tap your place on the map if the search can’t find it." : "Drag the pin to adjust. The pin is where your listing lands on the map."}
      </p>
    </div>
  );
}

/** Put the draggable pin at a point, creating it the first time. */
function placePin(
  map: MlMap,
  pinRef: { current: Marker | null },
  onPinRef: { current: (lat: number, lon: number) => void },
  lng: number,
  lat: number,
) {
  if (pinRef.current) {
    pinRef.current.setLngLat([lng, lat]);
    return;
  }
  const pinEl = document.createElement("div");
  pinEl.className = "post-pin";
  const pin = new Marker({ element: pinEl, anchor: "bottom", draggable: true }).setLngLat([lng, lat]).addTo(map);
  pin.on("dragend", () => {
    const p = pin.getLngLat();
    onPinRef.current(round6(p.lat), round6(p.lng));
  });
  pinRef.current = pin;
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
