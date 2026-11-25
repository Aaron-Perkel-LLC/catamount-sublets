"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { LIMITS } from "@/config/site";
import { formatMoney } from "@/lib/format";
import { PRICE_BASIS_VALUES, type PriceBasis } from "@/lib/options";
import { previewPerRoom, priceLines } from "@/lib/price";
import { adminLoadListing, adminSetListingRooms } from "@/server/actions/admin";
import type { ListingDto } from "@/server/data/listings";
import { useListingView } from "../listings/listing-view";
import { BTN, CHOICE, FIELD, FIELD_LABEL, GROUP, MUTED, SELECT } from "./ui";

const ROOMS = Array.from({ length: LIMITS.roomsMax }, (_, i) => i + 1);
const count = (s: string): number | null => (s.trim() === "" ? null : Number(s));

/**
 * The admin's Rooms editor on a listing: rooms sublet, bedrooms, roommates
 * and whether the price is per room or for the whole place, for fixing a
 * whole-house listing posted before rooms existed. The price stays as the
 * poster typed it. As on the post form, the basis starts unchosen when rooms
 * go from 1 to more (every older listing is "room"), and the line under it
 * shows how the listing will read.
 */
export function AdminRoomsEditor({ listing }: { listing: ListingDto }) {
  const router = useRouter();
  const { refresh } = useListingView();
  const [pending, start] = useTransition();
  const [rooms, setRooms] = useState(listing.roomsAvailable);
  const [bedrooms, setBedrooms] = useState(listing.bedrooms?.toString() ?? "");
  const [roommates, setRoommates] = useState(listing.roommates?.toString() ?? "");
  const [basis, setBasis] = useState<PriceBasis | null>(listing.roomsAvailable > 1 ? listing.priceBasis : null);
  const [note, setNote] = useState<string | null>(null);
  const multi = rooms > 1;
  const effective: PriceBasis | null = multi ? basis : "room";
  const shownAs = effective ? priceLines({ price: listing.price, pricePerRoom: previewPerRoom(listing.price, effective, rooms), priceBasis: effective, roomsAvailable: rooms }).text : null;

  return (
    <form
      className="flex flex-col gap-2 border-t border-notice-line pt-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await adminSetListingRooms({ listingId: listing.id, roomsAvailable: rooms, bedrooms: count(bedrooms), roommates: count(roommates), priceBasis: effective });
          setNote(r.ok ? `Saved: ${r.data.priceText}.` : r.error);
          if (!r.ok) return;
          // The open view holds the listing as it was loaded: reload it so its price, chip and size show the change.
          const fresh = await adminLoadListing(listing.id);
          if (fresh) refresh(fresh);
          router.refresh();
        });
      }}
    >
      <span className={GROUP}>Rooms</span>
      <div className="grid grid-cols-3 gap-x-3 gap-y-2 md:flex md:items-end">
        <label className={FIELD_LABEL}>
          Rooms sublet
          <select
            className={`${SELECT} md:w-24`}
            value={rooms}
            disabled={pending}
            onChange={(e) => {
              const next = Number(e.target.value);
              if (rooms <= 1 && next > 1) setBasis(null);
              setRooms(next);
            }}
          >
            {ROOMS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className={FIELD_LABEL}>
          Bedrooms
          <input className={`${FIELD} md:w-20`} type="number" min={0} max={20} step={1} value={bedrooms} disabled={pending} onChange={(e) => setBedrooms(e.target.value)} />
        </label>
        <label className={FIELD_LABEL}>
          Roommates
          <input className={`${FIELD} md:w-20`} type="number" min={0} max={20} step={1} value={roommates} disabled={pending} onChange={(e) => setRoommates(e.target.value)} />
        </label>
      </div>
      {multi && (
        <fieldset className="flex flex-wrap gap-x-4">
          <legend className="sr-only">The price, {formatMoney(listing.price)}, is</legend>
          {PRICE_BASIS_VALUES.map((v) => (
            <label key={v} className={CHOICE}>
              <input type="radio" name={`basis-${listing.id}`} checked={basis === v} disabled={pending} onChange={() => setBasis(v)} />
              {v === "room" ? "Price is per room" : `Price is for the whole place (all ${rooms})`}
            </label>
          ))}
        </fieldset>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className={BTN} disabled={pending}>
          Save rooms
        </button>
        <span className={MUTED} role="status">
          {note ?? (shownAs ? `Shows as ${shownAs}` : "Choose per room or the whole place.")}
        </span>
      </div>
    </form>
  );
}
