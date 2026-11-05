"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import type { EventSource } from "@/lib/options";
import { track } from "@/lib/track";
import type { ListingDto } from "@/server/data/listings";
import { ListingCard } from "./ListingCard";
import { useListingView } from "./listing-view";

/**
 * The board. `openId` is a deep link (a share link coming back from
 * sign-in): the matching listing opens on mount, with the arrival counted by
 * where the link came from.
 */
export function ListingsGrid({
  listings,
  openId,
  openSource,
  anyExists,
  filtered,
}: {
  listings: ListingDto[];
  openId?: number;
  openSource?: EventSource;
  anyExists: boolean;
  filtered: boolean;
}) {
  const { open } = useListingView();
  const opened = useRef<number | null>(null);

  useEffect(() => {
    if (!openId || opened.current === openId) return;
    const target = listings.find((l) => l.id === openId);
    if (!target) return;
    opened.current = openId;
    track("share_arrival", openId, openSource ?? "deeplink");
    // Drop ?id= so a reload or Back does not reopen it.
    const url = new URL(window.location.href);
    url.searchParams.delete("id");
    url.searchParams.delete("via");
    history.replaceState(history.state, "", url);
    open(target, openSource ?? "deeplink");
  }, [openId, openSource, listings, open]);

  const missing = openId !== undefined && !listings.some((l) => l.id === openId);

  return (
    <div id="listingsGrid" className="flex flex-col gap-4">
      {missing && (
        <p className="rounded-lg border border-notice-line bg-notice-tint px-3 py-2 text-sm text-notice-ink">
          The listing you followed isn&apos;t up any more. Here is everything that is.
        </p>
      )}
      {listings.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-paper px-6 py-12 text-center">
          <p className="text-lg font-bold">{filtered ? "Nothing matches those filters." : "No listings up right now."}</p>
          <p className="mt-1 text-ink-2">
            {filtered ? (
              "Try widening them."
            ) : anyExists ? (
              <>
                Check back soon, or <Link href="/post" className="link">post yours</Link>.
              </>
            ) : (
              <>
                Yours would be the first one people see. <Link href="/post" className="link">Post a listing</Link>.
              </>
            )}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((l) => (
            <ListingCard key={l.id} listing={l} source="browse" />
          ))}
        </div>
      )}
    </div>
  );
}
