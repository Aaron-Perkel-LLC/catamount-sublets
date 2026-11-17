"use client";

import { useEffect } from "react";
import { track } from "@/lib/track";

/** Counts a view of the listing's own page, once per mount (the server dedupes per visitor and Eastern day, and drops bots). */
export function ViewBeacon({ listingId }: { listingId: number }) {
  useEffect(() => {
    track("listing_open", listingId, "deeplink");
  }, [listingId]);
  return null;
}
