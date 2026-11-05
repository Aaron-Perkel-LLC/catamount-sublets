import type { LayerSpecification, Map as MapLibreMap, StyleSpecification } from "maplibre-gl";

/**
 * The basemap: OpenFreeMap's Positron vector style (no key, no quota),
 * repainted in the site's palette before the first frame. OpenFreeMap is one
 * volunteer-run service, so anything short of a drawn map falls back to
 * Esri's keyless light-grey raster canvas.
 */
export const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
/** The TileJSON the style points at; fetched alongside the style and inlined, which saves a round trip before the first tile. */
export const MAP_TILEJSON_URL = "https://tiles.openfreemap.org/planet";
/** A cheap raster under the vector layers so the ground shows in a few hundred milliseconds; removed once the vector map has drawn. */
export const UNDERLAY_LAYER_ID = "sublets-underlay";
export const BACKGROUND_OPACITY_TRANSITION = 400;
export const MAP_ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
/** OpenFreeMap's tiles stop at z14 and overzoom sharply; 19 is about a house. */
export const MAP_MAX_ZOOM = 19;
/** How long the vector map gets to show a first tile before the raster replaces it. */
export const MAP_LOAD_TIMEOUT_MS = 10_000;

let stylePromise: Promise<StyleSpecification> | null = null;

/**
 * The style JSON, fetched once per page and shared. MapViewLoader and the
 * post form call this the moment the page mounts, so the fetch overlaps the
 * MapLibre chunk's download instead of waiting for it; the map then awaits
 * the same promise.
 */
export function loadMapStyle(): Promise<StyleSpecification> {
  const json = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${url} ${r.status}`))));
  stylePromise ??= Promise.all([json(MAP_STYLE_URL) as Promise<StyleSpecification>, json(MAP_TILEJSON_URL).catch(() => null)])
    .then(([style, tilejson]) => {
      const recoloured = recolourMapStyle(style);
      const omt = recoloured.sources?.openmaptiles as Record<string, unknown> | undefined;
      if (omt) {
        // Credit travels with the source, so it shows only while the vector map does.
        omt.attribution = MAP_ATTRIBUTION;
        if (tilejson && Array.isArray(tilejson.tiles)) {
          // Inline the TileJSON: MapLibre can request tiles the moment the style lands.
          delete omt.url;
          omt.tiles = tilejson.tiles;
          if (typeof tilejson.minzoom === "number") omt.minzoom = tilejson.minzoom;
          if (typeof tilejson.maxzoom === "number") omt.maxzoom = tilejson.maxzoom;
        }
      }
      return withUnderlay(recoloured);
    })
    .catch((e) => {
      stylePromise = null; // let a later mount try again
      throw e;
    });
  // A copy per map: the promise outlives a client-side navigation from one map page to the other.
  return stylePromise.then((s) => structuredClone(s));
}

/**
 * Keep a vector map honest. A tile arriving is the proof the service works.
 * Until one has, an error from the vector source, or silence for
 * MAP_LOAD_TIMEOUT_MS, means the map would stay blank, so the raster takes
 * over; after one, it stays. After the first full draw the vector ground
 * replaces the raster underlay. Returns a cleanup for unmount.
 */
export function watchVectorMap(map: MapLibreMap): () => void {
  let tileArrived = false;
  let stopped = false;
  const fallBack = () => {
    if (tileArrived || stopped) return;
    tileArrived = true; // run once
    map.setStyle(fallbackStyle());
  };
  const timer = setTimeout(fallBack, MAP_LOAD_TIMEOUT_MS);
  map.on("sourcedata", (e) => {
    if (e.sourceId === "openmaptiles" && e.tile) {
      tileArrived = true;
      clearTimeout(timer);
    }
  });
  map.once("idle", () => {
    if (!stopped && tileArrived) revealVectorMap(map);
  });
  map.on("error", (e) => {
    if ((e as { sourceId?: string }).sourceId === "openmaptiles") fallBack();
  });
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}

/**
 * The ground before the vector tiles arrive: Esri's grey canvas as the
 * bottom layer, with the vector background made transparent so the raster
 * shows through until the vector map has drawn (see revealVectorMap). Lines,
 * fills and labels paint over it as their tiles land, so nothing is blank.
 */
function withUnderlay(style: StyleSpecification): StyleSpecification {
  const raster = fallbackStyle();
  style.sources = { ...style.sources, [UNDERLAY_LAYER_ID]: raster.sources["esri-base"] };
  const bg = style.layers.find((l) => l.type === "background");
  if (bg) {
    const paint = ((bg as { paint?: Record<string, unknown> }).paint ??= {});
    paint["background-opacity"] = 0;
    paint["background-opacity-transition"] = { duration: BACKGROUND_OPACITY_TRANSITION, delay: 0 };
  }
  style.layers = [{ id: UNDERLAY_LAYER_ID, type: "raster", source: UNDERLAY_LAYER_ID, paint: { "raster-opacity": 0.9 } }, ...style.layers];
  return style;
}

/** Once the vector map has drawn: show its own ground and drop the raster. */
export function revealVectorMap(map: MapLibreMap) {
  const bg = map.getStyle().layers.find((l) => l.type === "background");
  if (bg) map.setPaintProperty(bg.id, "background-opacity", 1);
  if (map.getLayer(UNDERLAY_LAYER_ID)) {
    setTimeout(() => {
      try {
        map.removeLayer(UNDERLAY_LAYER_ID);
        map.removeSource(UNDERLAY_LAYER_ID);
      } catch {
        // the map may be gone
      }
    }, BACKGROUND_OPACITY_TRANSITION + 50);
  }
}

/**
 * The map's colours. A GL style cannot read CSS variables, so these mirror
 * the tokens by hand, lightened where a token would be loud across a whole
 * neighbourhood. Land is a cool fog so white streets read; campus gets a
 * faint sand wash; labels are ink. The pins stay the only saturated thing.
 */
export const MAP_COLOURS = {
  land: "#EEF1F1",
  residential: "#EAEEEE",
  park: "#DCEBDD",
  wood: "#D5E6D6",
  campus: "#EEE9DF",
  water: "#C6DEF1",
  waterway: "#A9CDEA",
  waterLabel: "#1D4F73",
  building: "#E1E6E7",
  buildingLine: "#D3DADC",
  roadCasing: "#D3DADC",
  road: "#FFFFFF",
  roadMinor: "#DCE2E3",
  path: "#E1E6E7",
  rail: "#D3DADC",
  roadLabel: "#5F6B74",
  placeLabel: "#1C2328",
  halo: "#FFFFFF",
} as const;

/**
 * Positron, repainted. Layers are matched by what they draw (source-layer
 * and type) rather than by id, so a renamed layer upstream keeps its colour
 * instead of reverting to grey. Mutates and returns the style.
 */
export function recolourMapStyle(style: StyleSpecification): StyleSpecification {
  const C = MAP_COLOURS;
  const layers = style.layers ?? [];
  for (const layer of layers) {
    const id = layer.id ?? "";
    const src = "source-layer" in layer ? (layer["source-layer"] ?? "") : "";
    const paint = ((layer as { paint?: Record<string, unknown> }).paint ??= {});
    if (layer.type === "background") {
      paint["background-color"] = C.land;
    } else if (layer.type === "fill") {
      if (src === "park") paint["fill-color"] = C.park;
      else if (src === "water") paint["fill-color"] = C.water;
      else if (src === "landcover" && /wood/.test(id)) paint["fill-color"] = C.wood;
      else if (src === "landuse" && /residential/.test(id)) paint["fill-color"] = C.residential;
      else if (src === "building") {
        paint["fill-color"] = C.building;
        paint["fill-outline-color"] = C.buildingLine;
      } else if (src === "transportation") paint["fill-color"] = C.land;
    } else if (layer.type === "line") {
      if (src === "waterway") paint["line-color"] = C.waterway;
      else if (src === "transportation") {
        if (/casing/.test(id)) paint["line-color"] = C.roadCasing;
        else if (/dashline/.test(id)) paint["line-color"] = C.road;
        else if (/rail/.test(id)) paint["line-color"] = C.rail;
        else if (/path|pier/.test(id)) paint["line-color"] = C.path;
        else if (/minor/.test(id)) paint["line-color"] = C.roadMinor;
        else if (/inner/.test(id)) paint["line-color"] = C.road;
      }
    } else if (layer.type === "symbol") {
      // One typeface, not three: every font stack costs its own glyph ranges
      // (about 75 KB each) before a label can draw. Bold stays for places.
      const layoutFont = (layer as { layout?: Record<string, unknown> }).layout;
      if (layoutFont && Array.isArray(layoutFont["text-font"])) {
        layoutFont["text-font"] = (layoutFont["text-font"] as string[]).some((f) => /bold/i.test(f)) ? ["Noto Sans Bold"] : ["Noto Sans Regular"];
      }
      let text: string | null = null;
      if (src === "transportation_name") text = C.roadLabel;
      else if (src === "place") text = C.placeLabel;
      else if (src === "water_name" || src === "waterway") text = C.waterLabel;
      const layout = (layer as { layout?: Record<string, unknown> }).layout;
      if (text && layout && layout["text-field"]) {
        paint["text-color"] = text;
        paint["text-halo-color"] = C.halo;
      }
    }
  }

  // Campus, washed: the landmark every listing is measured from. Positron
  // draws no land use but housing, so this layer is new; it goes under the
  // buildings, which then read as campus buildings.
  const at = layers.findIndex((l) => "source-layer" in l && l["source-layer"] === "building");
  const campus: LayerSpecification = {
    id: "sublets-campus",
    type: "fill",
    source: "openmaptiles",
    "source-layer": "landuse",
    filter: ["match", ["get", "class"], ["university", "college"], true, false],
    paint: { "fill-color": C.campus },
  };
  if (at === -1) layers.push(campus);
  else layers.splice(at, 0, campus);
  style.layers = layers;
  return style;
}

/**
 * Esri's grey canvas as a raster style. Two traps in its URL: the path is
 * {z}/{y}/{x} (row before column), and it stops at z16 around campus, so
 * request no deeper and let MapLibre upscale the rest.
 */
export function fallbackStyle(): StyleSpecification {
  const base = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}";
  const ref = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}";
  const attribution = "© Esri — Esri, HERE, Garmin, USGS, NGA";
  return {
    version: 8,
    sources: {
      "esri-base": { type: "raster", tiles: [base], tileSize: 256, maxzoom: 16, attribution },
      "esri-ref": { type: "raster", tiles: [ref], tileSize: 256, maxzoom: 16 },
    },
    layers: [
      { id: "esri-base", type: "raster", source: "esri-base" },
      { id: "esri-ref", type: "raster", source: "esri-ref" },
    ],
  };
}

/**
 * MapLibre's compact attribution starts expanded and only folds once the map
 * is moved; on a phone that box covers the bottom of the map. Fold it once the
 * map has loaded; the (i) button still opens it.
 */
export function foldAttribution(map: { once: (type: "load", fn: () => void) => unknown; getContainer: () => HTMLElement }): void {
  map.once("load", () => map.getContainer().querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show"));
}

export function webglAvailable(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2")); // MapLibre 6 draws with WebGL2 only, raster included
  } catch {
    return false;
  }
}
