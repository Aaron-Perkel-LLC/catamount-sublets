"use client";

import { useEffect } from "react";
import { trackShareArrival } from "@/lib/track";

/**
 * Counts an arrival by a share link, from the browser only, after the page
 * has loaded: link previews and unfurlers fetch the page without running
 * scripts, so they never count. The server dedupes per visitor and Eastern
 * day and drops bots.
 */
export function ShareArrivalBeacon({ listingId, slug }: { listingId: number; slug: string }) {
  useEffect(() => {
    trackShareArrival(listingId, slug);
  }, [listingId, slug]);
  return null;
}
