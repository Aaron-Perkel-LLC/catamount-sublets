import { ADMIN_INBOX, SITE } from "@/config/site";
import type { DbOrTx } from "@/db";
import { appUrl } from "@/env";
import { milesBetween } from "@/lib/distance";
import { formatMoney } from "@/lib/format";
import { AMENITIES, AMENITY_KEYS, ROOMMATE_GENDER_OPTIONS, ROOMMATE_PREFERENCE_OPTIONS, UTILITY_OPTIONS, type ListingStatus } from "@/lib/options";
import { amenityField } from "@/lib/listing-input";
import { semesterLabel } from "@/lib/semesters";
import AdminNoticeEmail, { type NoticeRow } from "@/emails/admin-notice";
import { listingById, type MyListing } from "@/server/data/my-listing";
import { sendMail } from "./send";

/**
 * Admin notices: one email per change a poster makes, carrying the listing.
 * A new listing lists every field; an edit lists only what changed, before
 * and after; a status change or a delete says what the listing was. A save
 * that changes nothing sends nothing.
 */

export interface Snapshot {
  id: number;
  ownerEmail: string;
  ownerName: string | null;
  fields: { key: string; label: string; value: string }[];
  lat: number;
  lon: number;
  price: number;
  address: string;
  status: ListingStatus;
}

export async function listingSnapshot(db: DbOrTx, id: number): Promise<Snapshot | null> {
  const l = await listingById(db, id);
  return l ? snapshotOf(l) : null;
}

export function snapshotOf(l: MyListing): Snapshot {
  const r = l.row;
  const yes = (v: string | null | undefined, fallback = "—") => (v && v.trim() ? v : fallback);
  const utility = (v: string) => UTILITY_OPTIONS[v as keyof typeof UTILITY_OPTIONS] ?? v;
  const amenities = AMENITY_KEYS.filter((k) => r[amenityField(k)])
    .map((k) => AMENITIES[k].label)
    .join(", ");
  const fields = [
    { key: "price", label: "Price", value: `${formatMoney(r.price)}/mo${r.priceNegotiable ? " (or best offer)" : ""}` },
    { key: "semesters", label: "Semesters", value: semesterLabel(l.semesters.map((s) => s.name)) },
    { key: "address", label: "Address", value: r.address },
    { key: "pin", label: "Map pin", value: `${r.lat.toFixed(5)}, ${r.lon.toFixed(5)}` },
    { key: "bedrooms", label: "Bedrooms", value: r.bedrooms === null ? "—" : String(r.bedrooms) },
    { key: "bathrooms", label: "Bathrooms", value: r.bathrooms === null ? "—" : String(r.bathrooms) },
    { key: "roommates", label: "Roommates staying", value: r.roommates === null ? "—" : String(r.roommates) },
    { key: "roommateGender", label: "Who lives there", value: ROOMMATE_GENDER_OPTIONS[r.roommateGender as keyof typeof ROOMMATE_GENDER_OPTIONS] ?? "—" },
    { key: "roommatePreference", label: "Hoping to sublet to", value: ROOMMATE_PREFERENCE_OPTIONS[r.roommatePreference as keyof typeof ROOMMATE_PREFERENCE_OPTIONS] ?? "—" },
    { key: "electric", label: "Electric", value: utility(r.utilityElectric) },
    { key: "gas", label: "Gas", value: utility(r.utilityGas) },
    { key: "water", label: "Water", value: utility(r.utilityWater) },
    { key: "internet", label: "Internet", value: utility(r.utilityInternet) },
    { key: "utilityCost", label: "Utilities estimate", value: r.utilityCost === null ? "—" : formatMoney(r.utilityCost) },
    { key: "amenities", label: "Amenities", value: amenities || "—" },
    { key: "contactEmail", label: "Contact email", value: yes(r.contactEmail, `— (account email ${l.ownerEmail})`) },
    { key: "contactPhone", label: "Phone", value: yes(r.contactPhone) },
    { key: "description", label: "Description", value: yes(r.description).slice(0, 1200) },
    { key: "photos", label: "Photos", value: String(l.photos.length) },
  ];
  return { id: r.id, ownerEmail: l.ownerEmail, ownerName: l.ownerName, fields, lat: r.lat, lon: r.lon, price: r.price, address: r.address, status: r.status as ListingStatus };
}

function line(s: Snapshot): string {
  return `${formatMoney(s.price)}/mo at ${s.address}`;
}

/** The poster as the admin knows them: name first, the email after it; the email alone when there is no name. */
export function who(s: Snapshot): string {
  return s.ownerName ? `${s.ownerName} (${s.ownerEmail})` : s.ownerEmail;
}

/** The subject leads with the poster's name, so the inbox reads as a list of people. */
function subjectFor(s: Snapshot, what: string): string {
  return `${s.ownerName ?? s.ownerEmail} · ${what}: ${line(s)}`;
}

/** Fields that differ, as rows with before and after; the pin as a distance. */
export function noticeChanges(before: Snapshot, after: Snapshot): NoticeRow[] {
  const rows: NoticeRow[] = [];
  const beforeMap = new Map(before.fields.map((f) => [f.key, f]));
  for (const f of after.fields) {
    const b = beforeMap.get(f.key);
    if (!b || b.value === f.value) continue;
    if (f.key === "pin") {
      const miles = milesBetween(before.lat, before.lon, after.lat, after.lon);
      if (miles < 0.01) continue;
      rows.push({ label: "Map pin", before: b.value, after: `${f.value} (moved ${miles.toFixed(2)} mi)` });
    } else rows.push({ label: f.label, before: b.value, after: f.value });
  }
  return rows;
}

async function send(subject: string, props: Parameters<typeof AdminNoticeEmail>[0], ref: number) {
  if (!ADMIN_INBOX) return; // NEXT_PUBLIC_ADMIN_EMAILS unset: nobody to tell
  await sendMail({ to: ADMIN_INBOX, subject: `[${SITE.name}] ${subject}`, react: AdminNoticeEmail(props), kind: "admin_notice", ref });
}

const links = (id: number) => ({ listing: `${appUrl()}/listing/${id}`, admin: `${appUrl()}/admin#post:${id}` });

export async function noticeCreated(s: Snapshot): Promise<void> {
  await send(subjectFor(s, "New listing"), {
    title: "New listing",
    intro: `${who(s)} posted a listing.`,
    rows: s.fields.map((f) => ({ label: f.label, after: f.value })),
    links: links(s.id),
  }, s.id);
}

export async function noticeUpdated(before: Snapshot, after: Snapshot, photosAdded = 0): Promise<void> {
  const rows = noticeChanges(before, after);
  if (photosAdded > 0) rows.push({ label: "Photos added", after: String(photosAdded) });
  if (rows.length === 0) return;
  const names = rows.map((r) => r.label.toLowerCase());
  const named = names.length <= 3 ? names.join(", ") : `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`;
  await send(subjectFor(after, `Listing edited (${named})`), {
    title: "Listing edited",
    intro: `${who(after)} changed their listing.`,
    rows,
    links: links(after.id),
  }, after.id);
}

export async function noticeStatus(s: Snapshot, status: ListingStatus, by: "poster" | "admin"): Promise<void> {
  const verb = { open: "put back up", paused: "paused", taken: "marked as taken" }[status];
  await send(subjectFor(s, `Listing ${verb}`), {
    title: `Listing ${verb}`,
    intro: by === "admin" ? `The admin ${verb} the listing by ${who(s)}.` : `${who(s)} ${verb} their listing.`,
    rows: s.fields.slice(0, 4).map((f) => ({ label: f.label, after: f.value })),
    links: links(s.id),
  }, s.id);
}

export async function noticeDeleted(s: Snapshot, by: "poster" | "admin"): Promise<void> {
  await send(subjectFor(s, "Listing deleted"), {
    title: "Listing deleted",
    intro: by === "admin" ? `The admin deleted the listing by ${who(s)}. It was:` : `${who(s)} deleted their listing. It was:`,
    rows: s.fields.map((f) => ({ label: f.label, after: f.value })),
  }, s.id);
}
