import { priceLines, type PriceFacts } from "@/lib/price";

/**
 * A listing's price in the listing view (signed in and out): the figure the
 * poster typed and its unit ("$850/mo", "$3,200 total"), the other figure
 * under it for several rooms ("$800/room", "4 rooms"), and "or best offer".
 * No hooks, so it renders on the server and in the dialog alike.
 */
export function PriceTag({ listing }: { listing: PriceFacts & { priceNegotiable: boolean } }) {
  const p = priceLines(listing);
  return (
    <span className="flex flex-col">
      <span className="text-2xl font-bold text-ink">
        {p.main}
        <span className="ml-0.5 text-base font-normal text-ink-3">{p.unit === "total" ? " total" : p.unit}</span>
        {listing.priceNegotiable && <small className="ml-2 text-sm font-normal text-maple-ink">or best offer</small>}
      </span>
      {p.sub && <span className="text-sm text-ink-2">{p.sub}</span>}
    </span>
  );
}
