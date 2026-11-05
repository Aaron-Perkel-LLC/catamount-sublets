"use client";

import {
  Bed,
  Bolt,
  Calendar,
  Car,
  Droplet,
  Flame,
  Mail,
  MapPin,
  PawPrint,
  Pencil,
  Phone,
  Receipt,
  Share2,
  Shirt,
  Snowflake,
  Sofa,
  UserRound,
  Users,
  UtensilsCrossed,
  Wifi,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { formatMiles } from "@/lib/distance-format";
import { formatMoney } from "@/lib/format";
import { AMENITIES, type AmenityKey, amenityFormLabel, type EventSource, UTILITY_KINDS, type UtilityKind } from "@/lib/options";
import type { ListingDto } from "@/server/data/listings";
import { ContactPanel } from "./ContactPanel";
import { useShareSheet } from "@/components/share/share-sheet";
import { formatMoney as money } from "@/lib/format";
import { Gallery } from "./Gallery";
import type { Viewer } from "./listing-view";

const UTILITY_LABELS: Record<UtilityKind, { label: string; icon: ReactNode }> = {
  electric: { label: "Electric", icon: <Bolt className="h-4 w-4" aria-hidden /> },
  gas: { label: "Gas", icon: <Flame className="h-4 w-4" aria-hidden /> },
  water: { label: "Water", icon: <Droplet className="h-4 w-4" aria-hidden /> },
  internet: { label: "Internet", icon: <Wifi className="h-4 w-4" aria-hidden /> },
};

const AMENITY_ICONS: Record<AmenityKey, ReactNode> = {
  freeParking: <Car className="h-4 w-4" aria-hidden />,
  paidParking: <Car className="h-4 w-4" aria-hidden />,
  laundryFree: <Shirt className="h-4 w-4" aria-hidden />,
  laundryPaid: <Shirt className="h-4 w-4" aria-hidden />,
  dishwasher: <UtensilsCrossed className="h-4 w-4" aria-hidden />,
  airConditioning: <Snowflake className="h-4 w-4" aria-hidden />,
  petsAllowed: <PawPrint className="h-4 w-4" aria-hidden />,
  furnished: <Sofa className="h-4 w-4" aria-hidden />,
};

function prefersAppleMaps(): boolean {
  return typeof navigator !== "undefined" && /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);
}

/**
 * The listing view. A centered dialog on a desktop; at phone widths a
 * full-screen sheet whose top bar (close, share) and bottom bar (price,
 * Email, Call) stay put while the photos and details scroll between them.
 */
export function ListingModal({
  listing,
  source,
  viewer,
  onClose,
  actions,
}: {
  listing: ListingDto;
  source: EventSource;
  viewer: Viewer;
  onClose: () => void;
  actions?: ReactNode;
}) {
  const [panel, setPanel] = useState<"email" | "phone" | null>(null);
  const { open: openShare } = useShareSheet();
  const share = () => openShare({ url: listing.shareUrl, price: money(listing.price), semester: listing.semesterLabel, listingId: listing.id, source });
  const dialog = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);

  // The provider keys this component by listing id, so a new listing is a
  // fresh mount: panel state resets by itself and focus starts on Close.
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
        const focusable = dialog.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
        );
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

  const price = (
    <span className="text-2xl font-bold text-ink">
      {formatMoney(listing.price)}
      <span className="text-base font-normal text-ink-3">/mo</span>
      {listing.priceNegotiable && <small className="ml-2 text-sm font-normal text-maple-ink">or best offer</small>}
    </span>
  );

  // Only the distance up here: the semester and the size have their own rows below.
  const facts = formatMiles(listing.distanceMi);
  const useApple = prefersAppleMaps();
  const utilities = UTILITY_KINDS.filter((k) => listing.utilities[k] !== "");
  const amenities = (Object.keys(AMENITIES) as AmenityKey[]).filter((k) => listing.amenities[k]);
  const canContact = !listing.isMine;

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
        aria-label={`Listing at ${listing.shortAddress}`}
        className="flex h-dvh w-full flex-col overflow-hidden bg-paper sm:h-auto sm:max-h-[90dvh] sm:max-w-2xl sm:rounded-xl sm:shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-line px-3 py-2 sm:hidden">
          <button ref={closeBtn} type="button" onClick={onClose} aria-label="Close listing" className="rounded-lg p-2 hover:bg-line-light">
            <X aria-hidden />
          </button>
          <button type="button" aria-label="Share this listing" className="rounded-lg p-2 hover:bg-line-light" onClick={share}>
            <Share2 aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {panel ? (
            <div className="p-4 sm:p-6">
              <ContactPanel key={panel} listing={listing} kind={panel} source={source} viewer={viewer} onBack={() => setPanel(null)} />
            </div>
          ) : (
            <>
              <div className="relative">
                <Gallery photos={listing.photos} alt={`Photo of ${listing.shortAddress}`} />
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close listing"
                  className="absolute left-2 top-2 hidden rounded-full bg-ink/70 p-1.5 text-paper hover:bg-ink sm:block"
                >
                  <X aria-hidden />
                </button>
              </div>
              <div className="flex flex-col gap-4 p-4 sm:p-6">
                {actions}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    {price}
                    <p className="text-sm text-ink-2">{facts}</p>
                    <p className="text-sm text-ink-3">
                      Posted by {listing.posterName ?? "the poster"} · {listing.postedAgo}
                    </p>
                  </div>
                  {/* On a phone, Share is in the top bar and Email/Call in the bar at the bottom: one of each. */}
                  <div className="flex flex-wrap gap-2">
                    {canContact && (
                      <button type="button" className="btn-primary hidden gap-2 px-3 py-2 text-sm sm:inline-flex" onClick={() => setPanel("email")}>
                        <Mail className="h-4 w-4" aria-hidden /> Email
                      </button>
                    )}
                    {canContact && listing.hasPhone && (
                      <button type="button" className="btn-primary hidden gap-2 px-3 py-2 text-sm sm:inline-flex" onClick={() => setPanel("phone")}>
                        <Phone className="h-4 w-4" aria-hidden /> Call
                      </button>
                    )}
                    <button type="button" className="btn-secondary hidden gap-2 px-3 py-2 text-sm sm:inline-flex" onClick={share}>
                      <Share2 className="h-4 w-4" aria-hidden /> Share
                    </button>
                    {listing.isMine && (
                      <Link href="/post" className="btn-secondary gap-2 px-3 py-2 text-sm">
                        <Pencil className="h-4 w-4" aria-hidden /> Edit
                      </Link>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-2 text-ink-2">
                  <p className="flex items-start gap-2">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    <span>
                      {listing.shortAddress}{" "}
                      <a
                        href={useApple ? listing.appleMapsUrl : listing.mapsUrl}
                        target="_blank"
                        rel="noopener"
                        className="link text-sm"
                      >
                        {useApple ? "Open in Maps" : "Open in Google Maps"}
                      </a>
                    </span>
                  </p>
                  <p className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 shrink-0" aria-hidden />
                    {listing.semesterLabel}
                  </p>
                  {(listing.sizeSummary || listing.roommateGenderLabel || listing.roommatePreferenceLabel) && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                      {listing.sizeSummary && (
                        <span className="inline-flex items-center gap-1.5">
                          <Bed className="h-4 w-4" aria-hidden /> {listing.sizeSummary}
                        </span>
                      )}
                      {listing.roommateGenderLabel && (
                        <span className="inline-flex items-center gap-1.5">
                          <Users className="h-4 w-4" aria-hidden /> Currently: {listing.roommateGenderLabel}
                        </span>
                      )}
                      {listing.roommatePreferenceLabel && (
                        <span className="inline-flex items-center gap-1.5 text-notice-ink">
                          <UserRound className="h-4 w-4" aria-hidden /> Hoping to sublet to: {listing.roommatePreferenceLabel}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <p className="whitespace-pre-line text-ink">{listing.description || "No description provided."}</p>

                {(utilities.length > 0 || amenities.length > 0 || listing.utilityCost) && (
                  <div className="flex flex-col gap-3 rounded-lg border border-line bg-cream p-3">
                    {utilities.length > 0 && (
                      <div>
                        <h4 className="mb-1.5 text-sm font-bold">Utilities</h4>
                        <div className="flex flex-wrap gap-2">
                          {utilities.map((k) => {
                            const included = listing.utilities[k] === "landlord";
                            return (
                              <span
                                key={k}
                                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${included ? "border-included-line bg-included-tint text-included-ink" : "border-tenant-line bg-tenant-tint text-tenant-ink"}`}
                              >
                                {UTILITY_LABELS[k].icon} {UTILITY_LABELS[k].label}: {included ? "Included" : "Tenant pays"}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {listing.utilityCost !== null && listing.utilityCost > 0 && (
                      <p className="flex items-center gap-1.5 text-sm">
                        <Receipt className="h-4 w-4" aria-hidden /> Est. monthly utilities: <strong>{formatMoney(listing.utilityCost)}</strong>
                      </p>
                    )}
                    {amenities.length > 0 && (
                      <div>
                        <h4 className="mb-1.5 text-sm font-bold">Amenities</h4>
                        <div className="flex flex-wrap gap-2">
                          {amenities.map((k) => (
                            <span key={k} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper px-2.5 py-1 text-xs">
                              {AMENITY_ICONS[k]} {amenityFormLabel(k)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {canContact && !panel && (
          <div className="flex items-center justify-between gap-3 border-t border-line bg-paper px-4 py-3 sm:hidden">
            {price}
            <div className="flex gap-2">
              <button type="button" className="btn-primary gap-2 px-3 py-2 text-sm" onClick={() => setPanel("email")}>
                <Mail className="h-4 w-4" aria-hidden /> Email
              </button>
              {listing.hasPhone && (
                <button type="button" className="btn-primary gap-2 px-3 py-2 text-sm" onClick={() => setPanel("phone")}>
                  <Phone className="h-4 w-4" aria-hidden /> Call
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
