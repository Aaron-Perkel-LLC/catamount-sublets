"use client";

import dynamic from "next/dynamic";
import { preconnect } from "react-dom";
import { useEffect } from "react";
import type { ListingDto } from "@/server/data/listings";
import { loadMapStyle } from "./basemap";

/** MapLibre needs the DOM, so the map is a client-only chunk loaded on demand. */
const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[70dvh] min-h-[420px] items-center justify-center rounded-xl border border-line bg-line-light text-sm text-ink-3">
      Loading the map…
    </div>
  ),
});

export function MapViewLoader({ listings }: { listings: ListingDto[] }) {
  // The chunk is the slow part; the style and the first tiles can start now.
  preconnect("https://tiles.openfreemap.org");
  useEffect(() => {
    loadMapStyle().catch(() => {});
  }, []);
  return <MapView listings={listings} />;
}
