import { Bed, Calendar, MapPin } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { ACCESS } from "@/config/site";
import { formatMiles } from "@/lib/distance-format";
import { formatMoney } from "@/lib/format";
import type { PublicListing } from "@/server/data/public-listings";
import { UtilitiesAndAmenities } from "./facts";
import { PublicCta, signInForListing } from "./PublicCta";

/**
 * A listing as a signed-out visitor or a community account sees it, in the
 * dialog and on its own page: PublicListing only, so there is nothing here to
 * leak. No hooks, so it renders on the server for the page and on the client
 * in the dialog. `cta` replaces the sign-in prompt (a community account's
 * Message poster form); `community` changes only the wording, since signing
 * in again would show them nothing more.
 */
export function PublicListingDetails({
  listing,
  headingLevel = "h2",
  community = false,
  cta,
}: {
  listing: PublicListing;
  headingLevel?: "h1" | "h2";
  community?: boolean;
  cta?: ReactNode;
}) {
  const Heading = headingLevel;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Heading className="text-lg font-bold text-ink">{listing.title}</Heading>
        <span className="text-2xl font-bold text-ink">
          {formatMoney(listing.price)}
          <span className="text-base font-normal text-ink-3">/mo</span>
          {listing.priceNegotiable && <small className="ml-2 text-sm font-normal text-maple-ink">or best offer</small>}
        </span>
        <p className="text-sm text-ink-2">{formatMiles(listing.distanceMi)}</p>
        <p className="text-sm text-ink-3">Posted {listing.postedAgo}</p>
      </div>

      {cta ?? <PublicCta id={listing.id} />}

      <div className="flex flex-col gap-2 text-ink-2">
        <p className="flex items-start gap-2">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            {listing.neighborhood} <span className="text-sm text-ink-3">(approximate area; the exact address is for {ACCESS.audience})</span>
          </span>
        </p>
        <p className="flex items-center gap-2">
          <Calendar className="h-4 w-4 shrink-0" aria-hidden />
          {listing.semesterLabel}
        </p>
        {listing.sizeSummary && (
          <p className="flex items-center gap-2 text-sm">
            <Bed className="h-4 w-4" aria-hidden /> {listing.sizeSummary}
          </p>
        )}
      </div>

      {/* The same words whether or not there is a description: nothing about it is public. */}
      <p className="text-ink-3">
        {community ? (
          `The description is for ${ACCESS.audience}. Ask the poster anything in your message.`
        ) : (
          <Link href={signInForListing(listing.id)} className="link">
            {ACCESS.schools} students: sign in to read the description.
          </Link>
        )}
      </p>

      <UtilitiesAndAmenities utilities={listing.utilities} utilityCost={listing.utilityCost} amenities={listing.amenities} />
    </div>
  );
}
