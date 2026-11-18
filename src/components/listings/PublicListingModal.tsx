"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import type { PublicListing } from "@/server/data/public-listings";
import { Gallery } from "./Gallery";
import { MessagePoster, type RelaySender } from "./MessagePoster";
import { PublicListingDetails } from "./PublicListingDetails";

/**
 * The listing view for a signed-out visitor or a community account: photos,
 * the public facts, and the sign-in prompt (signed out) or Message poster (a
 * community account, `relay`). No address, map link, poster, Email, Call or
 * Share: none of it is in a PublicListing to show.
 */
export function PublicListingModal({ listing, onClose, relay }: { listing: PublicListing; onClose: () => void; relay?: RelaySender | null }) {
  const dialog = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeBtn.current?.focus();
  }, []);

  // Escape closes; Tab stays inside the dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "Tab" && dialog.current) {
        const focusable = dialog.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])');
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={listing.title}
        className="flex h-dvh w-full flex-col overflow-hidden bg-paper sm:h-auto sm:max-h-[90dvh] sm:max-w-2xl sm:rounded-xl sm:shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-line px-3 py-2 sm:hidden">
          <button ref={closeBtn} type="button" onClick={onClose} aria-label="Close listing" className="rounded-lg p-2 hover:bg-line-light">
            <X aria-hidden />
          </button>
          <Link href={`/listing/${listing.id}`} className="link px-2 text-sm">
            Open as a page
          </Link>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="relative">
            <Gallery photos={listing.photos} alt={`Photo of ${listing.title}`} />
            <button
              type="button"
              onClick={onClose}
              aria-label="Close listing"
              className="absolute left-2 top-2 hidden rounded-full bg-ink/70 p-1.5 text-paper hover:bg-ink sm:block"
            >
              <X aria-hidden />
            </button>
          </div>
          <div className="p-4 sm:p-6">
            <PublicListingDetails listing={listing} community={Boolean(relay)} cta={relay ? <MessagePoster listingId={listing.id} sender={relay} /> : undefined} />
          </div>
        </div>
      </div>
    </div>
  );
}
