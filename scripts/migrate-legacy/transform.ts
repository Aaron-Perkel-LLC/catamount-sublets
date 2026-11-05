import { createHmac } from "node:crypto";
import { orderSemesterCodes } from "../../src/lib/semesters";
import { guessNames } from "../../src/lib/person-name";
import { ADMIN_EMAILS, LEGACY_EMAIL_OVERRIDES, LEGACY_IMAGE_PATH, legacyEmailFor } from "./config";
import type { LegacyData } from "./types";

/**
 * Legacy rows → what the new tables get (PLAN.md §2.3). Pure, so the dry
 * run and the tests can inspect it. Opt-outs are removed here, as posters,
 * before anything is planned.
 */

export interface PlanUser {
  legacyNetid: string;
  email: string;
  name: string;
  role: "user" | "admin";
  /** Guessed from the legacy "name shown"; a prefill for the welcome form, never a certainty. */
  firstName: string | null;
  lastName: string | null;
}
export interface PlanListing {
  id: number;
  legacyNetid: string;
  price: number;
  priceNegotiable: boolean;
  address: string;
  lat: number;
  lon: number;
  bedrooms: number | null;
  bathrooms: number | null;
  roommates: number | null;
  roommateGender: string;
  roommatePreference: string;
  description: string | null;
  displayName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  utilityElectric: string;
  utilityGas: string;
  utilityWater: string;
  utilityInternet: string;
  utilityCost: number | null;
  amenityFreeParking: boolean;
  amenityPaidParking: boolean;
  amenityLaundryFree: boolean;
  amenityLaundryPaid: boolean;
  amenityDishwasher: boolean;
  amenityAirConditioning: boolean;
  amenityPetsAllowed: boolean;
  amenityFurnished: boolean;
  status: string;
  statusChangedAt: Date | null;
  postedAt: Date;
  legacyShareToken: string | null;
}
export interface PlanPhoto {
  id: number;
  listingId: number;
  sortOrder: number;
  stem: string;
  ext: string;
  legacyPath: string;
}
export interface Plan {
  users: PlanUser[];
  listings: PlanListing[];
  listingSemesters: { listingId: number; code: string; position: number }[];
  photos: PlanPhoto[];
  semesters: { code: string; name: string; active: boolean; sortOrder: number; archivedAt: Date | null; createdAt: Date | null }[];
  archives: LegacyData["semester_archives"];
  autoIncrement: LegacyData["autoIncrement"];
  excluded: { netids: string[]; listingIds: number[] };
  warnings: string[];
}

export function legacyShareToken(id: number, secret: string): string {
  return createHmac("sha256", secret).update(`sublet:${id}`).digest("hex").slice(0, 10);
}

/** Opt-outs are NetIDs or emails, one per line; '#' starts a comment. */
export function parseOptOuts(text: string): Set<string> {
  return new Set(
    text
      .split(/\r?\n/)
      .map((l) => l.replace(/#.*$/, "").trim().toLowerCase())
      .filter(Boolean),
  );
}

export function buildPlan(data: LegacyData, options: { optOuts: Set<string>; shareSecret: string | null }): Plan {
  const warnings: string[] = [];
  const optedOut = (netid: string) => options.optOuts.has(netid) || options.optOuts.has(legacyEmailFor(netid)) || options.optOuts.has(`${netid}@uvm.edu`);

  const keptSublets = data.sublets.filter((s) => !optedOut(s.username));
  const excludedNetids = [...new Set(data.sublets.filter((s) => optedOut(s.username)).map((s) => s.username))];
  const excludedListingIds = data.sublets.filter((s) => optedOut(s.username)).map((s) => s.id);
  const keptIds = new Set(keptSublets.map((s) => s.id));

  // Users: one per distinct poster.
  const users = new Map<string, PlanUser>();
  for (const s of keptSublets) {
    if (users.has(s.username)) {
      warnings.push(`two listings for ${s.username}; the legacy schema should have prevented that`);
      continue;
    }
    const email = legacyEmailFor(s.username).toLowerCase();
    // A blank "name shown" fell back to the NetID, and some people typed their NetID there: neither is a name.
    const shown = s.display_name.trim();
    const guess = shown && shown.toLowerCase() !== s.username.toLowerCase() ? guessNames(shown) : { first: null, last: null };
    users.set(s.username, { legacyNetid: s.username, email, name: s.display_name.trim() || s.username, role: ADMIN_EMAILS.includes(email) ? "admin" : "user", firstName: guess.first, lastName: guess.last });
  }
  // The admin exists whether or not they have a listing: the Admin tab must be reachable at the first sign-in.
  for (const email of ADMIN_EMAILS) {
    if ([...users.values()].some((u) => u.email === email)) continue;
    const netid = Object.entries(LEGACY_EMAIL_OVERRIDES).find(([, e]) => e === email)?.[0] ?? email.split("@")[0];
    users.set(netid, { legacyNetid: netid, email, name: netid, role: "admin", firstName: null, lastName: null });
    warnings.push(`admin ${email} has no listing; account created without one`);
  }

  // Semesters: every row, plus an inactive placeholder for any code a listing uses that has no row.
  const semesters = data.semesters.map((s) => ({ code: s.code, name: s.name, active: s.active, sortOrder: s.sort_order, archivedAt: s.archived_at, createdAt: s.created_at }));
  const semesterByCode = new Map(semesters.map((s) => [s.code, s]));
  for (const ss of data.sublet_semesters) {
    if (!semesterByCode.has(ss.semester_code)) {
      warnings.push(`semester code ${ss.semester_code} has no semesters row; adding it inactive`);
      const row = { code: ss.semester_code, name: ss.semester_code, active: false, sortOrder: 0, archivedAt: null, createdAt: null };
      semesters.push(row);
      semesterByCode.set(ss.semester_code, row);
    }
  }

  // Listing semesters in calendar order; a listing with no rows gets its primary semester.
  const listingSemesters: Plan["listingSemesters"] = [];
  for (const s of keptSublets) {
    let codes = data.sublet_semesters.filter((x) => x.sublet_id === s.id).map((x) => x.semester_code);
    if (codes.length === 0) {
      warnings.push(`listing ${s.id} has no sublet_semesters rows; using its primary semester ${s.semester}`);
      codes = [s.semester];
      if (!semesterByCode.has(s.semester)) {
        const row = { code: s.semester, name: s.semester, active: false, sortOrder: 0, archivedAt: null, createdAt: null };
        semesters.push(row);
        semesterByCode.set(s.semester, row);
      }
    }
    const ordered = orderSemesterCodes([...new Set(codes)].map((c) => ({ code: c, name: semesterByCode.get(c)!.name, sortOrder: semesterByCode.get(c)!.sortOrder })));
    for (const o of ordered) listingSemesters.push({ listingId: s.id, code: o.code, position: o.position });
  }

  const listings: PlanListing[] = keptSublets.map((s) => ({
    id: s.id,
    legacyNetid: s.username,
    price: s.price,
    priceNegotiable: s.price_negotiable,
    address: s.address,
    lat: s.lat,
    lon: s.lon,
    bedrooms: s.bedrooms,
    bathrooms: s.bathrooms,
    roommates: s.roommates,
    roommateGender: s.roommate_gender,
    roommatePreference: s.roommate_preference,
    description: s.description?.trim() ? s.description : null,
    displayName: s.display_name.trim().slice(0, 60),
    contactEmail: s.contact_email?.trim() ? s.contact_email.trim().toLowerCase() : null,
    contactPhone: s.contact_phone?.trim() ? s.contact_phone.trim() : null,
    utilityElectric: s.utility_electric,
    utilityGas: s.utility_gas,
    utilityWater: s.utility_water,
    utilityInternet: s.utility_internet,
    utilityCost: s.utility_cost,
    amenityFreeParking: s.amenity_free_parking,
    amenityPaidParking: s.amenity_paid_parking,
    amenityLaundryFree: s.amenity_laundry_free,
    amenityLaundryPaid: s.amenity_laundry_paid,
    amenityDishwasher: s.amenity_dishwasher,
    amenityAirConditioning: s.amenity_air_conditioning,
    amenityPetsAllowed: s.amenity_pets_allowed,
    amenityFurnished: s.amenity_furnished,
    status: s.status,
    statusChangedAt: s.status_changed_at,
    postedAt: s.posted_at ?? new Date(0),
    legacyShareToken: options.shareSecret ? legacyShareToken(s.id, options.shareSecret) : null,
  }));

  // Photos, renumbered 0..n−1 per listing by (sort_order, id), as the legacy displayed them.
  const photos: PlanPhoto[] = [];
  const byListing = new Map<number, LegacyData["sublet_images"]>();
  for (const img of data.sublet_images) {
    if (!keptIds.has(img.sublet_id)) continue;
    byListing.set(img.sublet_id, [...(byListing.get(img.sublet_id) ?? []), img]);
  }
  for (const [listingId, imgs] of byListing) {
    imgs.sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
    for (const [i, img] of imgs.entries()) {
      const m = LEGACY_IMAGE_PATH.exec(img.image_url);
      if (!m) {
        warnings.push(`photo ${img.id} has an unexpected path ${img.image_url}; skipped`);
        continue;
      }
      photos.push({ id: img.id, listingId, sortOrder: i, stem: m[1].toLowerCase(), ext: m[2].toLowerCase(), legacyPath: img.image_url });
    }
  }
  for (const s of keptSublets) if (!byListing.has(s.id)) warnings.push(`listing ${s.id} has no photos; it will not be on the board until one is added`);

  return {
    users: [...users.values()],
    listings,
    listingSemesters,
    photos,
    semesters,
    archives: data.semester_archives,
    autoIncrement: data.autoIncrement,
    excluded: { netids: excludedNetids, listingIds: excludedListingIds },
    warnings,
  };
}
