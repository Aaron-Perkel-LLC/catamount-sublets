"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { LISTING_STATUSES, LISTING_STATUS_VALUES, type ListingStatus } from "@/lib/options";
import { adminDeleteListing, adminSetListingStatus, adminSetListingVisibility } from "@/server/actions/admin";
import type { ListingDto } from "@/server/data/listings";
import { goAdmin } from "./go";
import { BTN_DANGER, FIELD_LABEL, GROUP, LINK, MUTED, SELECT } from "./ui";

/** A label beside its dropdown; above it on a phone, where the two dropdowns share the row. */
const LABEL_ROW = `${FIELD_LABEL} md:flex-row md:items-center md:gap-2`;

/**
 * The admin's strip at the top of a listing view: its status, who can see
 * it, its photos in the Photos section, and delete. What was the Posts tab's
 * row. Only the admin can change a listing's audience; posters have no switch.
 */
export function AdminPostActions({ listing, close }: { listing: ListingDto; close: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<ListingStatus>(listing.status);
  const [signedInOnly, setSignedInOnly] = useState(listing.signedInOnly);
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
    <div className="flex flex-col gap-2 rounded-lg border border-notice-line bg-notice-tint px-3 py-2">
      <div className="flex items-center gap-3">
        <span className={`${GROUP} mr-auto text-notice-ink tabular-nums`}>Admin · #{listing.id}</span>
        <button type="button" className={`${LINK} tabular-nums`} onClick={() => leave(() => goAdmin(router, `/admin/photos#images:${listing.id}`))}>
          {photos} photo{photos === 1 ? "" : "s"}
        </button>
        <button
          type="button"
          className={BTN_DANGER}
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
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 md:flex md:items-center">
        <label className={LABEL_ROW}>
          Status
          <select
            className={`${SELECT} md:w-28`}
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
        <label className={LABEL_ROW}>
          Seen by
          <select
            className={`${SELECT} md:w-40`}
            value={signedInOnly ? "signed-in" : "everyone"}
            disabled={pending}
            onChange={(e) => {
              const next = e.target.value === "signed-in";
              start(async () => {
                const r = await adminSetListingVisibility(listing.id, next);
                if (r.ok) {
                  setSignedInOnly(next);
                  router.refresh();
                }
                setNote(r.ok ? "Saved." : r.error);
              });
            }}
          >
            <option value="everyone">Everyone</option>
            <option value="signed-in">Signed-in only</option>
          </select>
        </label>
      </div>
      {note && (
        <span role="status" className={MUTED}>
          {note}
        </span>
      )}
    </div>
  );
}
