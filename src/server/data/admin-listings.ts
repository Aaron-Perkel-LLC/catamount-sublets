import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { listingPhotos, listings, user } from "@/db/schema";
import type { ListingRowDto } from "@/components/admin/types";
import { attentionFlags } from "@/lib/admin-attention";
import { daysBetweenDates, easternDate } from "@/lib/dates";
import { formatAddress } from "@/lib/format";
import type { PriceBasis } from "@/lib/options";
import { priceLines, roomsChip } from "@/lib/price";
import { semesterSpan } from "@/lib/semesters";
import type { ListingNumbers } from "./admin-metrics";
import { labelFor, listingSemestersByListing } from "./semesters";
import { posterColumns, shownName } from "./names";
import { publicListingWhere, visibleSemesterWhere } from "./visibility";

/**
 * Every listing as the admin sees it: its poster, where it stands and its
 * semesters. Admin pages only (the caller has checked the admin); it carries
 * posters' emails.
 */
export interface AdminPost {
  id: number;
  ownerId: string;
  ownerEmail: string;
  ownerName: string | null;
  shortAddress: string;
  /** The per-room price (price_per_room): what the board sorts and filters by. */
  pricePerRoom: number;
  /** "$850/mo", "$3,200 total · $800/room" (priceLines). */
  priceText: string;
  roomsAvailable: number;
  /** "Whole place · 4 BR", "3 rooms", or null for one room (roomsChip). */
  roomsLabel: string | null;
  status: string;
  /** Not on a visible semester. */
  hidden: boolean;
  /** On the board right now (publicListingWhere: visible, open, has a photo, poster not banned). */
  onBoard: boolean;
  signedInOnly: boolean;
  photos: number;
  postedAt: Date;
  confirmedAvailableAt: Date | null;
  legacyImport: boolean;
  semesterLabel: string;
  semesterShort: string;
  /** The first semester's code (position 0), what the events are tagged with. */
  firstSemester: string | null;
}

export async function adminPosts(db: DbOrTx): Promise<AdminPost[]> {
  const rows = await db
    .select({
      id: listings.id,
      ownerId: user.id,
      ownerEmail: user.email,
      poster: posterColumns,
      displayName: listings.displayName,
      address: listings.address,
      price: listings.price,
      pricePerRoom: listings.pricePerRoom,
      priceBasis: listings.priceBasis,
      roomsAvailable: listings.roomsAvailable,
      bedrooms: listings.bedrooms,
      roommates: listings.roommates,
      status: listings.status,
      hidden: sql<boolean>`not (${visibleSemesterWhere()})`,
      onBoard: sql<boolean>`(${publicListingWhere()})`,
      signedInOnly: listings.signedInOnly,
      photos: sql<number>`(select count(*) from ${listingPhotos} p where p.listing_id = ${listings.id})::int`,
      postedAt: listings.postedAt,
      confirmedAvailableAt: listings.confirmedAvailableAt,
      legacyImport: listings.legacyImport,
    })
    .from(listings)
    .innerJoin(user, eq(user.id, listings.userId))
    .orderBy(desc(listings.id));
  const sems = await listingSemestersByListing(db, rows.map((p) => p.id));
  return rows.map(({ poster, displayName, address, price, priceBasis, bedrooms, roommates, ...p }) => {
    const list = sems.get(p.id) ?? [];
    return {
      ...p,
      priceText: priceLines({ price, pricePerRoom: p.pricePerRoom, priceBasis: priceBasis as PriceBasis, roomsAvailable: p.roomsAvailable }).text,
      roomsLabel: roomsChip({ roomsAvailable: p.roomsAvailable, bedrooms, roommates }),
      hidden: Boolean(p.hidden),
      onBoard: Boolean(p.onBoard),
      ownerName: shownName({ displayName }, poster, p.ownerEmail),
      shortAddress: formatAddress(address),
      semesterLabel: labelFor(list, false).label,
      semesterShort: semesterSpan(list.map((x) => x.name)),
      firstSemester: list[0]?.code ?? null,
    };
  });
}

/** All listings' rows for the admin table (and the Overview's needs-attention list), with a row for each deleted listing that still has events. */
export function listingRows(posts: AdminPost[], numbers: Map<number, ListingNumbers>, now: Date = new Date()): ListingRowDto[] {
  const zero: ListingNumbers = { views: 0, contacts: 0, converted: 0, shares: 0, arrivals: 0, views14: 0 };
  const today = easternDate(now);
  const live = new Set(posts.map((p) => p.id));
  const rows: ListingRowDto[] = posts.map((p) => {
    const n = numbers.get(p.id) ?? zero;
    const postedAt = p.postedAt.toISOString();
    const confirmedAvailableAt = p.confirmedAvailableAt?.toISOString() ?? null;
    return {
      id: p.id,
      label: p.shortAddress,
      deleted: false,
      pricePerRoom: p.pricePerRoom,
      priceText: p.priceText,
      rooms: p.roomsAvailable,
      roomsLabel: p.roomsLabel,
      ownerId: p.ownerId,
      ownerName: p.ownerName,
      ownerEmail: p.ownerEmail,
      status: p.status,
      onBoard: p.onBoard,
      hidden: p.hidden,
      studentsOnly: p.signedInOnly,
      semesterLabel: p.semesterLabel,
      semesterShort: p.semesterShort,
      firstSemester: p.firstSemester,
      postedAt,
      ageDays: daysBetweenDates(easternDate(p.postedAt), today),
      confirmedAvailableAt,
      photos: p.photos,
      views: n.views,
      contacts: n.contacts,
      converted: n.converted,
      shares: n.shares,
      arrivals: n.arrivals,
      views14: n.views14,
      flags: attentionFlags({ status: p.status, onBoard: p.onBoard, postedAt, confirmedAvailableAt, views: n.views, contacts: n.contacts, views14: n.views14 }, now),
    };
  });
  for (const [id, n] of numbers) {
    if (live.has(id) || (n.views === 0 && n.contacts === 0 && n.shares === 0 && n.arrivals === 0)) continue;
    rows.push({ id, label: `Deleted #${id}`, deleted: true, pricePerRoom: null, priceText: null, rooms: null, roomsLabel: null, ownerId: null, ownerName: null, ownerEmail: null, status: "deleted", onBoard: false, hidden: false, studentsOnly: false, semesterLabel: "", semesterShort: "", firstSemester: null, postedAt: null, ageDays: null, confirmedAvailableAt: null, photos: 0, ...n, flags: [] });
  }
  return rows;
}
