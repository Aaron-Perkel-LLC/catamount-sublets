/**
 * The legacy tables as the migration reads them, whichever reader produced
 * them (the dump parser for rehearsals, mysql2 for the live final sync).
 * Timestamps are UTC instants: the live database stores TIMESTAMP in UTC
 * and the dump was exported with time_zone = '+00:00'.
 */

export interface LegacySublet {
  id: number;
  image_url: string;
  thumbnail_url: string | null;
  price: number;
  price_negotiable: boolean;
  address: string;
  semester: string;
  bedrooms: number | null;
  bathrooms: number | null;
  roommates: number | null;
  roommate_gender: string;
  roommate_preference: string;
  lat: number;
  lon: number;
  description: string | null;
  posted_at: Date | null;
  username: string;
  display_name: string;
  contact_email: string | null;
  contact_phone: string | null;
  utility_electric: string;
  utility_gas: string;
  utility_water: string;
  utility_internet: string;
  utility_cost: number | null;
  amenity_free_parking: boolean;
  amenity_paid_parking: boolean;
  amenity_laundry_free: boolean;
  amenity_laundry_paid: boolean;
  amenity_dishwasher: boolean;
  amenity_air_conditioning: boolean;
  amenity_pets_allowed: boolean;
  amenity_furnished: boolean;
  status: string;
  status_changed_at: Date | null;
}

export interface LegacyImage {
  id: number;
  sublet_id: number;
  image_url: string;
  sort_order: number;
}

export interface LegacySubletSemester {
  sublet_id: number;
  semester_code: string;
}

export interface LegacySemester {
  id: number;
  code: string;
  name: string;
  active: boolean;
  sort_order: number;
  created_at: Date | null;
  archived_at: Date | null;
}

export interface LegacyArchive {
  id: number;
  semester_code: string;
  semester_name: string;
  archived_at: Date;
  archived_by: string;
  listings: number;
  taken: number;
  price_median: number | null;
  price_min: number | null;
  price_max: number | null;
  views: number;
  contacts: number;
  shares: number;
  share_arrivals: number;
  photos: number;
  bytes: number;
  tarball: string | null;
}

export interface LegacyData {
  sublets: LegacySublet[];
  sublet_images: LegacyImage[];
  sublet_semesters: LegacySubletSemester[];
  semesters: LegacySemester[];
  semester_archives: LegacyArchive[];
  /** AUTO_INCREMENT values, so the new sequences continue from the same numbers. */
  autoIncrement: { sublets: number; sublet_images: number };
}

/** A raw row as a reader hands it over: column name → string | number | null. */
export type RawRow = Record<string, string | number | null>;
