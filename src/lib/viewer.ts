import type { EventViewerTier } from "./options";

/**
 * Who is looking, in four levels, and what each may see. The one decision
 * every read path makes (src/server/viewer.ts getViewer() builds it from the
 * session; nothing else asks "is there a session" to decide what to show).
 *
 *   anonymous  signed out: the public board (PublicListing), no contact
 *   community  signed in with an address outside the schools: exactly what
 *              anonymous sees, plus saved searches, the digest (public
 *              listings only) and the message relay; never posts
 *   student    a school address (or approved): every board listing in full,
 *              contact details, posting
 *   admin      the admin: as student, plus the admin pages
 */
export type ViewerLevel = "anonymous" | "community" | "student" | "admin";

/**
 * What a listing query may show (src/server/data/visibility.ts): "full" for
 * students and the admin, "public" for everyone else.
 */
export type Audience = "full" | "public";

/** A viewer as the data layer takes it: the level and, when signed in, the account id. */
export type ViewerRef = { level: "anonymous"; userId: null } | { level: Exclude<ViewerLevel, "anonymous">; userId: string };

/** The level for an account (or none). An unknown tier is community: fails closed. */
export function viewerLevelOf(user: { role: string | null | undefined; tier: string | null | undefined } | null): ViewerLevel {
  if (!user) return "anonymous";
  if (user.role === "admin") return "admin";
  return user.tier === "student" ? "student" : "community";
}

export function seesFullListings(level: ViewerLevel): boolean {
  return level === "student" || level === "admin";
}

export function audienceFor(level: ViewerLevel): Audience {
  return seesFullListings(level) ? "full" : "public";
}

/** Posting, photos, the address lookup: students and the admin. */
export function canPost(level: ViewerLevel): boolean {
  return seesFullListings(level);
}

/** Only community accounts message posters through the site; students email or call them directly. */
export function canMessagePosters(level: ViewerLevel): boolean {
  return level === "community";
}

/** The tier recorded on an analytics event; null for the admin, whose events are never stored. */
export function eventViewerTier(level: ViewerLevel): EventViewerTier | null {
  return level === "admin" ? null : level;
}
