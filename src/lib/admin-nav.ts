/**
 * The admin's sections, grouped. One array drives the group tabs, the row of
 * section pills under them, each page's title and the quick-jump box, so a
 * new section is one line here plus its page under src/app/(app)/admin/.
 * Pure; safe on both sides.
 */

export interface AdminNavItem {
  id: string;
  href: string;
  label: string;
  /** Extra words the quick-jump box matches ("banner" finds Announce). */
  keywords?: string;
  /** The page's numbers follow the date range, so its header carries the range control. */
  range?: boolean;
}

export interface AdminNavGroup {
  id: string;
  label: string;
  items: AdminNavItem[];
}

export const ADMIN_NAV: AdminNavGroup[] = [
  { id: "overview", label: "Overview", items: [{ id: "overview", href: "/admin", label: "Overview", keywords: "dashboard stats metrics funnel activity numbers", range: true }] },
  {
    id: "people",
    label: "People",
    items: [
      { id: "people", href: "/admin/people", label: "People", keywords: "accounts users ban delete stop email", range: true },
      { id: "requests", href: "/admin/requests", label: "Requests", keywords: "access school approve" },
    ],
  },
  {
    id: "listings",
    label: "Listings",
    items: [
      { id: "listings", href: "/admin/listings", label: "All listings", keywords: "posts supply demand attention outcomes ended", range: true },
      { id: "semesters", href: "/admin/semesters", label: "Semesters", keywords: "archive ask posters" },
      { id: "photos", href: "/admin/photos", label: "Photos", keywords: "images orphans" },
    ],
  },
  {
    id: "comms",
    label: "Comms",
    items: [
      { id: "announce", href: "/admin/announce", label: "Announce", keywords: "banner popup notice", range: true },
      { id: "email", href: "/admin/email", label: "Email", keywords: "mail message reply broadcast send sent outbox draft unsubscribe", range: true },
      { id: "digest", href: "/admin/digest", label: "Digest", keywords: "weekly saved search alerts", range: true },
      { id: "survey", href: "/admin/survey", label: "Survey", keywords: "feedback" },
    ],
  },
  { id: "system", label: "System", items: [{ id: "system", href: "/admin/system", label: "System", keywords: "storage blob caps read-only maintenance cron" }] },
];

export const ADMIN_NAV_ITEMS: AdminNavItem[] = ADMIN_NAV.flatMap((g) => g.items);

/** The section a pathname belongs to: an exact match, or the longest href it sits under ("/admin" only for itself). */
export function navItemFor(pathname: string): { group: AdminNavGroup; item: AdminNavItem } | null {
  const clean = pathname.replace(/\/+$/, "") || "/";
  for (const group of ADMIN_NAV) {
    for (const item of group.items) {
      if (item.href === clean || (item.href !== "/admin" && clean.startsWith(`${item.href}/`))) return { group, item };
    }
  }
  return null;
}
