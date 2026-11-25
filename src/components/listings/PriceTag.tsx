import { priceLines, type PriceFacts } from "@/lib/price";

/**
 * A listing's price in the listing view (signed in and out): the figure the
 * poster typed and its unit ("$850/mo", "$800/room", "$3,200 total"), the
 * per-room figure under a total ("$800/room"), and "or best offer". The
 * room count is the size chip's job, so it isn't repeated here.
 * No hooks, so it renders on the server and in the dialog alike.
 */
export function PriceTag({ listing }: { listing: PriceFacts & { priceNegotiable: boolean } }) {
  const p = priceLines(listing);
  // One room: exactly the markup this replaced ("$850/mo").
  const price = (
    <span className="text-2xl font-bold text-ink">
      {p.main}
      <span className="text-base font-normal text-ink-3">{p.unit === "total" ? " total" : p.unit}</span>
      {listing.priceNegotiable && <small className="ml-2 text-sm font-normal text-maple-ink">or best offer</small>}
    </span>
  );
  // "4 rooms" under a per-room price says what the size chip beside it already says; a total keeps its "$800/room".
  if (!p.sub || p.unit === "/room") return price;
  return (
    <span className="flex flex-col">
      {price}
      <span className="text-sm text-ink-2">{p.sub}</span>
    </span>
  );
}
