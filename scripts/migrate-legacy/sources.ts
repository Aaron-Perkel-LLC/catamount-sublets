import { readFile } from "node:fs/promises";
import { parseDump } from "./dump-parser";
import type { LegacyArchive, LegacyData, LegacyImage, LegacySemester, LegacySublet, LegacySubletSemester, RawRow } from "./types";

/**
 * Two readers, one shape. The dump reader is for rehearsals; the MySQL
 * reader (over an SSH tunnel to the Silk host) is for the live final sync.
 * Both yield UTC instants for every timestamp.
 */

const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
const strOrNull = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) throw new Error(`not a number: ${JSON.stringify(v)}`);
  return n;
};
const numOrNull = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : num(v));
const bool = (v: unknown): boolean => v === 1 || v === "1" || v === true;
/** "2026-03-21 23:07:23" (UTC) or a Date → Date. */
const date = (v: unknown): Date | null => {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return v;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?$/.exec(String(v));
  if (!m) throw new Error(`not a timestamp: ${JSON.stringify(v)}`);
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)));
};

export function coerceRows(tables: Map<string, RawRow[]>, autoIncrement: Map<string, number>): LegacyData {
  const get = (name: string) => tables.get(name) ?? [];
  const sublets: LegacySublet[] = get("sublets").map((r) => ({
    id: num(r.id),
    image_url: str(r.image_url),
    thumbnail_url: strOrNull(r.thumbnail_url),
    price: num(r.price),
    price_negotiable: bool(r.price_negotiable),
    address: str(r.address),
    semester: str(r.semester),
    bedrooms: numOrNull(r.bedrooms),
    bathrooms: numOrNull(r.bathrooms),
    roommates: numOrNull(r.roommates),
    roommate_gender: str(r.roommate_gender),
    roommate_preference: str(r.roommate_preference),
    lat: num(r.lat),
    lon: num(r.lon),
    description: strOrNull(r.description),
    posted_at: date(r.posted_at),
    username: str(r.username).toLowerCase(),
    display_name: str(r.display_name),
    contact_email: strOrNull(r.contact_email),
    contact_phone: strOrNull(r.contact_phone),
    utility_electric: str(r.utility_electric),
    utility_gas: str(r.utility_gas),
    utility_water: str(r.utility_water),
    utility_internet: str(r.utility_internet),
    utility_cost: numOrNull(r.utility_cost),
    amenity_free_parking: bool(r.amenity_free_parking),
    amenity_paid_parking: bool(r.amenity_paid_parking),
    amenity_laundry_free: bool(r.amenity_laundry_free),
    amenity_laundry_paid: bool(r.amenity_laundry_paid),
    amenity_dishwasher: bool(r.amenity_dishwasher),
    amenity_air_conditioning: bool(r.amenity_air_conditioning),
    amenity_pets_allowed: bool(r.amenity_pets_allowed),
    amenity_furnished: bool(r.amenity_furnished),
    status: str(r.status) || "open",
    status_changed_at: date(r.status_changed_at),
  }));
  const sublet_images: LegacyImage[] = get("sublet_images").map((r) => ({ id: num(r.id), sublet_id: num(r.sublet_id), image_url: str(r.image_url), sort_order: numOrNull(r.sort_order) ?? 0 }));
  const sublet_semesters: LegacySubletSemester[] = get("sublet_semesters").map((r) => ({ sublet_id: num(r.sublet_id), semester_code: str(r.semester_code) }));
  const semesters: LegacySemester[] = get("semesters").map((r) => ({
    id: num(r.id),
    code: str(r.code),
    name: str(r.name),
    active: bool(r.active),
    sort_order: numOrNull(r.sort_order) ?? 0,
    created_at: date(r.created_at),
    archived_at: date(r.archived_at),
  }));
  const semester_archives: LegacyArchive[] = get("semester_archives").map((r) => ({
    id: num(r.id),
    semester_code: str(r.semester_code),
    semester_name: str(r.semester_name),
    archived_at: date(r.archived_at) ?? new Date(0),
    archived_by: str(r.archived_by),
    listings: num(r.listings),
    taken: numOrNull(r.taken) ?? 0,
    price_median: numOrNull(r.price_median),
    price_min: numOrNull(r.price_min),
    price_max: numOrNull(r.price_max),
    views: numOrNull(r.views) ?? 0,
    contacts: numOrNull(r.contacts) ?? 0,
    shares: numOrNull(r.shares) ?? 0,
    share_arrivals: numOrNull(r.share_arrivals) ?? 0,
    photos: numOrNull(r.photos) ?? 0,
    bytes: numOrNull(r.bytes) ?? 0,
    tarball: strOrNull(r.tarball),
  }));
  return {
    sublets,
    sublet_images,
    sublet_semesters,
    semesters,
    semester_archives,
    autoIncrement: {
      sublets: autoIncrement.get("sublets") ?? Math.max(0, ...sublets.map((s) => s.id)) + 1,
      sublet_images: autoIncrement.get("sublet_images") ?? Math.max(0, ...sublet_images.map((s) => s.id)) + 1,
    },
  };
}

export async function readDumpFile(file: string): Promise<LegacyData> {
  const sql = await readFile(file, "utf8");
  if (!/SET time_zone = "\+00:00"/.test(sql)) throw new Error("the dump does not pin time_zone to +00:00; refusing to guess its timestamps");
  const parsed = parseDump(sql);
  return coerceRows(parsed.tables, parsed.autoIncrement);
}

/** The live database through an SSH tunnel (mysql://user:pass@127.0.0.1:3306/db). */
export async function readMysql(url: string): Promise<LegacyData> {
  const mysql = await import("mysql2/promise");
  const conn = await mysql.createConnection({ uri: url, timezone: "Z", dateStrings: true });
  try {
    await conn.query("SET time_zone = '+00:00'");
    const tables = new Map<string, RawRow[]>();
    for (const t of ["sublets", "sublet_images", "sublet_semesters", "semesters", "semester_archives"]) {
      const [rows] = await conn.query<import("mysql2").RowDataPacket[]>(`SELECT * FROM \`${t}\``);
      tables.set(t, rows as RawRow[]);
    }
    const autoIncrement = new Map<string, number>();
    const [status] = await conn.query<import("mysql2").RowDataPacket[]>("SHOW TABLE STATUS WHERE Name IN ('sublets', 'sublet_images')");
    for (const s of status) autoIncrement.set(String(s.Name), Number(s.Auto_increment));
    return coerceRows(tables, autoIncrement);
  } finally {
    await conn.end();
  }
}
