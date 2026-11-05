"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { LISTING_STATUSES, LISTING_STATUS_VALUES, type ListingStatus } from "@/lib/options";
import { adminDeleteListing, adminSetListingStatus } from "@/server/actions/admin";
import type { ListingDto } from "@/server/data/listings";

/**
 * The admin's strip at the top of a listing view: its status, its photos in
 * the Images section, and delete. What was the Posts tab's row.
 */
export function AdminPostActions({ listing, close }: { listing: ListingDto; close: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<ListingStatus>(listing.status);
  const [note, setNote] = useState<string | null>(null);
  const photos = listing.photos.length;

  // Close the view, then go: the view's history entry has to be popped first or the new hash lands under it.
  const leave = (then: () => void) => {
    const pushed = Boolean(history.state?.listing);
    if (pushed) window.addEventListener("popstate", then, { once: true });
    close();
    if (!pushed) then();
  };

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-notice-line bg-notice-tint px-3 py-2 text-sm">
      <span className="font-bold text-notice-ink">Admin · #{listing.id}</span>
      <label className="flex items-center gap-1.5 text-ink-2">
        Status
        <select
          className="field w-28 py-1 text-xs"
          value={status}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.value as ListingStatus;
            start(async () => {
              const r = await adminSetListingStatus(listing.id, next);
              if (r.ok) {
                setStatus(next);
                router.refresh();
              }
              setNote(r.ok ? "Saved." : r.error);
            });
          }}
        >
          {LISTING_STATUS_VALUES.map((s) => (
            <option key={s} value={s}>
              {LISTING_STATUSES[s]}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className="link text-sm" onClick={() => leave(() => (window.location.hash = `images:${listing.id}`))}>
        {photos} photo{photos === 1 ? "" : "s"}
      </button>
      <button
        type="button"
        className="btn-secondary ml-auto px-2 py-1 text-xs text-error-ink"
        disabled={pending}
        onClick={() => {
          if (!confirm(`Delete the listing by ${listing.posterName ?? "this poster"} at ${listing.shortAddress}? This cannot be undone.`)) return;
          start(async () => {
            const r = await adminDeleteListing(listing.id);
            if (!r.ok) return setNote(r.error);
            close();
            router.refresh();
          });
        }}
      >
        Delete listing
      </button>
      {note && (
        <span role="status" className="w-full text-xs text-ink-3">
          {note}
        </span>
      )}
    </div>
  );
}
