import { getVersion, setWorkerUrl } from "maplibre-gl";

/**
 * Where MapLibre's worker is served from: a copy of
 * node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs in public/ (worker.test.ts
 * fails when the two differ, so a MapLibre upgrade means copying it again).
 *
 * MapLibre 6 finds its worker as `new URL("./maplibre-gl-worker.mjs",
 * import.meta.url)`. Inside a Turbopack chunk import.meta.url is not an http
 * URL, so it falls back to an empty string and starts the worker on the page's
 * own HTML, which fails. Without a worker no vector tile is ever parsed: the
 * Map page showed only its raster fallback and the post form's map stayed blank.
 */
export const MAP_WORKER_PATH = "/maplibre-gl-worker.mjs";

/** Call before the first map is built; the version busts the browser's cache on an upgrade. */
export function pointMapLibreAtServedWorker() {
  setWorkerUrl(`${MAP_WORKER_PATH}?v=${getVersion()}`);
}
