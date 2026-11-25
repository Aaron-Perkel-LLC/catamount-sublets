"use client";

import { useState } from "react";
import { formatMiles } from "@/lib/distance-format";
import { priceLines } from "@/lib/price";
import type { EventSource } from "@/lib/options";
import { type BoardListing, headingOf, isPublicListing } from "./board-listing";
import { preloadPhoto } from "./Gallery";
import { useListingView } from "./listing-view";

/**
 * One listing on the board. The whole card is the button that opens the view;
 * its first photo is preloaded on pointerdown, about 100 ms before the click.
 * Signed out, the heading is the generated title ("2BR · Old North End").
 */
export function ListingCard({ listing, source }: { listing: BoardListing; source: EventSource }) {
  const { open } = useListingView();
  const [imgFailed, setImgFailed] = useState(0);
  const cover = listing.photos[0];
  const facts = [formatMiles(listing.distanceMi), listing.sizeSummary].filter(Boolean).join(" · ");
  const heading = headingOf(listing);
  const p = priceLines(listing);

  return (
    <article
      role="button"
      tabIndex={0}
      aria-label={`${p.sub ? p.text : `${p.main} a month`}, ${heading}`}
      className="group flex cursor-pointer flex-col overflow-hidden rounded-xl border border-line bg-paper shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-3"
      onClick={() => open(listing, source)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open(listing, source);
        }
      }}
      onPointerDown={() => preloadPhoto(cover?.display)}
    >
      {/* The photo is taken out of flow: Chromium lets an in-flow h-full image
          stretch an aspect-ratio box to its own height, so portrait photos made
          taller cards on Chrome and Edge (Safari kept 4:3). */}
      <div className="relative aspect-[4/3] bg-line-light">
        {cover && imgFailed < 2 ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={imgFailed}
            src={imgFailed ? `${cover.thumb ?? cover.display}${(cover.thumb ?? cover.display).includes("?") ? "&" : "?"}retry=${imgFailed}` : (cover.thumb ?? cover.display)}
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
            onError={() => setImgFailed((n) => n + 1)}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-ink-3">Image not available</div>
        )}
        {/* "Or best offer" rides in the price tag, under the price it qualifies; several rooms add the other figure. */}
        <span className="absolute left-0 top-3 flex flex-col rounded-r-lg bg-maple px-3 py-1 text-base font-bold leading-tight text-paper shadow">
          <span>
            {p.main}
            <span className="text-xs font-normal">{p.unit === "total" ? " total" : p.unit}</span>
          </span>
          {p.sub && <span className="text-xs font-normal">{p.sub}</span>}
          {listing.priceNegotiable && <span className="text-xs font-normal">or best offer</span>}
        </span>
        <span className="absolute right-2 top-2 rounded-full bg-ink/70 px-2 py-0.5 text-xs font-bold text-paper">{listing.semesterLabel}</span>
      </div>
      <div className="flex flex-col gap-1.5 p-3">
        <h3 className="truncate font-bold text-ink">{heading}</h3>
        {facts && <p className="text-sm text-ink-2">{facts}</p>}
        {!isPublicListing(listing) && listing.confirmedAvailable && <p className="text-xs font-bold text-included-ink">Confirmed available {listing.confirmedAvailable}</p>}
        {listing.tags.length > 0 && (
          <ul className="flex flex-wrap gap-1.5 text-xs">
            {listing.tags.map((t) => (
              <li
                key={t.label}
                className={`rounded-full border px-2 py-0.5 ${
                  t.kind === "rooms"
                    ? "border-maple-ink/40 bg-paper font-bold text-maple-ink"
                    : t.kind === "included"
                    ? "border-included-line bg-included-tint text-included-ink"
                    : t.kind === "preference"
                      ? "border-notice-line bg-notice-tint text-notice-ink"
                      : "border-line bg-cream text-ink-2"
                }`}
              >
                {t.label}
              </li>
            ))}
            {listing.moreTags > 0 && <li className="rounded-full px-2 py-0.5 text-ink-3">+{listing.moreTags} more</li>}
          </ul>
        )}
      </div>
    </article>
  );
}
