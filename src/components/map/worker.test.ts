import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAP_WORKER_PATH } from "./worker";

describe("MapLibre worker", () => {
  it("public/ serves the installed MapLibre's worker, byte for byte", () => {
    const served = readFileSync(`public${MAP_WORKER_PATH}`);
    const installed = readFileSync("node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs");
    // On failure: cp node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs public/
    expect(served.equals(installed)).toBe(true);
  });
});
