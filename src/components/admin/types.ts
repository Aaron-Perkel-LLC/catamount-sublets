/** The admin sections' shared shapes (server → client props). */

export interface SemesterRowDto {
  code: string;
  name: string;
  active: boolean;
  archivedAt: string | null;
  postCount: number;
}
export interface ArchiveRowDto {
  semesterCode: string;
  semesterName: string;
  archivedAt: string;
  listings: number;
  taken: number;
  priceMedian: number | null;
  priceMin: number | null;
  priceMax: number | null;
  views: number;
  contacts: number;
  shares: number;
  shareArrivals: number;
  photos: number;
  bytes: number;
}
/** A person's post, as the People table shows it; the chip opens the full listing view. */
export interface PostSummaryDto {
  id: number;
  shortAddress: string;
  price: number;
  status: string;
  hidden: boolean;
  photos: number;
  semesterLabel: string;
}
export interface PersonDto {
  id: string;
  email: string;
  /** Their shown name; null when there is none, and the email stands in. */
  name: string | null;
  role: string;
  banned: boolean;
  banReason: string | null;
  noEmail: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  legacyNetid: string | null;
  post: PostSummaryDto | null;
}

/** A row of All listings: a listing with its numbers in the range, or a deleted one that still has events. */
export interface ListingRowDto {
  id: number;
  label: string;
  deleted: boolean;
  ownerId: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  /** open, paused, taken, or "deleted". */
  status: string;
  onBoard: boolean;
  hidden: boolean;
  studentsOnly: boolean;
  semesterLabel: string;
  firstSemester: string | null;
  postedAt: string | null;
  ageDays: number | null;
  confirmedAvailableAt: string | null;
  photos: number;
  views: number;
  contacts: number;
  converted: number;
  shares: number;
  arrivals: number;
  views14: number;
  flags: string[];
}
