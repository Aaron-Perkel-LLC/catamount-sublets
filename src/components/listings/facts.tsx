import { Bolt, Car, Droplet, Flame, PawPrint, Receipt, Shirt, Snowflake, Sofa, UtensilsCrossed, Wifi } from "lucide-react";
import type { ReactNode } from "react";
import type { AmenityFlags } from "@/lib/card-tags";
import { formatMoney } from "@/lib/format";
import { AMENITIES, type AmenityKey, amenityFormLabel, UTILITY_KINDS, type UtilityKind, type UtilityPayer } from "@/lib/options";

export const UTILITY_LABELS: Record<UtilityKind, { label: string; icon: ReactNode }> = {
  electric: { label: "Electric", icon: <Bolt className="h-4 w-4" aria-hidden /> },
  gas: { label: "Gas", icon: <Flame className="h-4 w-4" aria-hidden /> },
  water: { label: "Water", icon: <Droplet className="h-4 w-4" aria-hidden /> },
  internet: { label: "Internet", icon: <Wifi className="h-4 w-4" aria-hidden /> },
};

export const AMENITY_ICONS: Record<AmenityKey, ReactNode> = {
  freeParking: <Car className="h-4 w-4" aria-hidden />,
  paidParking: <Car className="h-4 w-4" aria-hidden />,
  laundryFree: <Shirt className="h-4 w-4" aria-hidden />,
  laundryPaid: <Shirt className="h-4 w-4" aria-hidden />,
  dishwasher: <UtensilsCrossed className="h-4 w-4" aria-hidden />,
  airConditioning: <Snowflake className="h-4 w-4" aria-hidden />,
  petsAllowed: <PawPrint className="h-4 w-4" aria-hidden />,
  furnished: <Sofa className="h-4 w-4" aria-hidden />,
};

/** Who pays which utility, the estimate, and the amenities: the same box signed in and out. */
export function UtilitiesAndAmenities({
  utilities: payers,
  utilityCost,
  amenities: flags,
}: {
  utilities: Record<UtilityKind, UtilityPayer>;
  utilityCost: number | null;
  amenities: AmenityFlags;
}) {
  const utilities = UTILITY_KINDS.filter((k) => payers[k] !== "");
  const amenities = (Object.keys(AMENITIES) as AmenityKey[]).filter((k) => flags[k]);
  if (!(utilities.length > 0 || amenities.length > 0 || utilityCost)) return null;
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-cream p-3">
      {utilities.length > 0 && (
        <div>
          <h4 className="mb-1.5 text-sm font-bold">Utilities</h4>
          <div className="flex flex-wrap gap-2">
            {utilities.map((k) => {
              const included = payers[k] === "landlord";
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
      {utilityCost !== null && utilityCost > 0 && (
        <p className="flex items-center gap-1.5 text-sm">
          <Receipt className="h-4 w-4" aria-hidden /> Est. monthly utilities: <strong>{formatMoney(utilityCost)}</strong>
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
  );
}
