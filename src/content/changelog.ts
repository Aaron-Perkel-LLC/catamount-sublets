/**
 * What's new (/whats-new): student-facing changes only, never admin or
 * internal work. Newest first. Each entry is an Eastern date, a title, one
 * to three plain sentences, and an optional link to a page here. An entry
 * dated in the future stays hidden until that day (Eastern).
 *
 * Every PR with a user-visible change adds an entry here (CLAUDE.md).
 */
export interface ChangelogEntry {
  /** Eastern calendar date, "YYYY-MM-DD". */
  date: string;
  title: string;
  body: string;
  link?: { href: string; label: string };
}

export const CHANGELOG: readonly ChangelogEntry[] = [
  {
    date: "2026-11-21",
    title: "Listings are public by default",
    body: "As we emailed on Nov 17, listings are now visible to signed-out visitors. They see price, semester, size, photos and the rough neighborhood, never your name, contact, address, title or description. Listings kept to signed-in students before today stay that way.",
  },
  {
    date: "2026-11-17",
    title: "An Account link and a What's new page",
    body: "Account now has its own link at the top right, next to Sign out (in the menu on a phone). This page lists what's changed, and a dot next to What's new at the bottom of the page means there's something you haven't seen.",
  },
  {
    date: "2026-11-17",
    title: "Browse without signing in",
    body: "Anyone can now look through Browse and Map and open a listing. Signed-out visitors see the price, photos and a rough area, never your name, contact, address or description.",
    link: { href: "/browse", label: "Browse listings" },
  },
  {
    date: "2026-11-16",
    title: "Saved searches and weekly alerts",
    body: 'On Browse, "Get alerts for this search" saves your filters. Every Monday morning we email you new listings that match. Rename, delete or turn off alerts in Account.',
    link: { href: "/account#alerts", label: "Your alerts" },
  },
  {
    date: "2026-11-15",
    title: "Did you find a subletter?",
    body: "When you delete your listing, we ask whether you found a subletter; any answer, or Skip, deletes it in one tap.",
  },
  {
    date: "2026-10-11",
    title: "Names with apostrophes and periods",
    body: "Names like O'Brien typed on an iPhone, and St. John, now save as you typed them.",
    link: { href: "/account", label: "Account" },
  },
  {
    date: "2026-10-10",
    title: "Card photos line up",
    body: "Every listing card's photo is the same shape in every browser, so tall photos no longer stretch their card.",
  },
  {
    date: "2026-10-09",
    title: "A new home for sublets",
    body: "The board moved here. You sign in with a code we email you, with no password to remember.",
  },
  {
    date: "2026-10-09",
    title: "Posting is quicker",
    body: 'A new listing starts with your photos, and they upload when you press Post. Afterwards you\'re back at the top with "Your listing is live." Students at other schools can ask for access from the front page.',
    link: { href: "/request", label: "Request access" },
  },
  {
    date: "2026-10-09",
    title: "Map pins open in view",
    body: "Opening a pin on the map now centres it with room for its popup, and the popup's close button is easier to tap.",
    link: { href: "/map", label: "Open the map" },
  },
];
