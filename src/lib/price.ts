import { formatMoney } from "./format";
import type { PriceBasis } from "./options";

/**
 * How a listing's price reads, everywhere it is shown. One room: exactly as
 * before ("$850/mo"). Several rooms: what the poster typed first, then the
 * other figure ("$3,200 total · $800/room", "$800/room · 4 rooms"). The
 * per-room figure is the database's price_per_room, the number every filter
 * and sort compares, so what a visitor reads is what they searched by.
 */
export interface PriceFacts {
  price: number;
  pricePerRoom: number;
  priceBasis: PriceBasis;
  roomsAvailable: number;
}

export interface PriceLines {
  /** The big number: "$850", "$800", "$3,200". */
  main: string;
  /** Beside it: "/mo", "/room", "total". */
  unit: string;
  /** Under it, multi-room only: "4 rooms", "$800/room". */
  sub: string | null;
  /** One line, for metadata, emails and labels: "$850/mo", "$3,200 total · $800/room". */
  text: string;
  /** The map pin: "$850", or "$800/rm" for several rooms. */
  pin: string;
  /** Inside a sentence ("Check out this … sublet"): "$850", or "$800/room" for several rooms. */
  short: string;
}

export function isMultiRoom(l: { roomsAvailable: number }): boolean {
  return l.roomsAvailable > 1;
}

export function priceLines(l: PriceFacts): PriceLines {
  if (!isMultiRoom(l)) {
    const main = formatMoney(l.price);
    return { main, unit: "/mo", sub: null, text: `${main}/mo`, pin: main, short: main };
  }
  const perRoom = formatMoney(l.pricePerRoom);
  const pin = `${perRoom}/rm`;
  const short = `${perRoom}/room`;
  if (l.priceBasis === "total") {
    const main = formatMoney(l.price);
    return { main, unit: "total", sub: `${perRoom}/room`, text: `${main} total · ${perRoom}/room`, pin, short };
  }
  const rooms = `${l.roomsAvailable} rooms`;
  return { main: perRoom, unit: "/room", sub: rooms, text: `${perRoom}/room · ${rooms}`, pin, short };
}

/**
 * The size chip for a multi-room listing: "Whole place · 4 BR" when it
 * sublets every bedroom with nobody staying, otherwise "3 rooms". Null for
 * one room, so a single-room listing (a solo 1 BR included) looks as before.
 */
export function roomsChip(l: { roomsAvailable: number; bedrooms: number | null; roommates: number | null }): string | null {
  if (!isMultiRoom(l)) return null;
  if (l.bedrooms === l.roomsAvailable && l.roommates === 0) return `Whole place · ${l.bedrooms} BR`;
  return `${l.roomsAvailable} rooms`;
}

/**
 * The per-room price the database will compute (price_per_room), for the
 * post form's "Shows as …" line before anything is saved. Postgres's round()
 * and Math.round agree on non-negative numbers, halves rounding up.
 */
export function previewPerRoom(price: number, priceBasis: PriceBasis, roomsAvailable: number): number {
  return priceBasis === "total" && roomsAvailable > 1 ? Math.round(price / roomsAvailable) : price;
}
