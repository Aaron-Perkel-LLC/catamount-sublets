/**
 * Everything that names the product or decides who may use it, in one place.
 * Code and email templates read these; they never spell a name, domain, handle
 * or address out. (A CI grep in Phase 8 enforces that for the old brand.)
 */

export const SITE = {
  name: "Catamount Sublets",
  /** Short form for places like the share text and the og:site_name. */
  shortName: "Catamount Sublets",
  domain: "catamountsublets.com",
  url: "https://catamountsublets.com",
  description:
    "Find and post sublets near campus in Burlington. Browse by price, semester and distance; every listing comes from a verified student.",
  /** The only support route the site advertises. */
  supportEmail: "aaron@catamountsublets.com",
  /** Transactional sender. Resend is verified on the root domain (8 Oct 2026); iCloud keeps the inbound MX. */
  mailDomain: "catamountsublets.com",
  mailFrom: "Catamount Sublets <login@catamountsublets.com>",
  /** Sender for the admin's own mail (listing notices, access requests), so it filters apart from codes. */
  mailFromNotices: "Catamount Sublets <notices@catamountsublets.com>",
  /** Sender for the notes signed by the author (broadcasts, the welcome): they are not about signing in. */
  mailFromPersonal: "Aaron at Catamount Sublets <aaron@catamountsublets.com>",
  mailReplyTo: "aaron@catamountsublets.com",
  instagramHandle: "@catamountsublets",
  instagramUrl: "https://www.instagram.com/catamountsublets/",
  /** Shown in the footer and on the share page. Keep it. */
  disclaimer:
    "An independent student project, not affiliated with or endorsed by the University of Vermont.",
  /** Author credit (page metadata, the broadcast sign-off); no university wording. */
  author: "Aaron Perkel",
  authorUrl: "https://aaronperkel.com",
  /** The legal entity that runs the site: the copyright line and the privacy page. */
  operator: "Aaron Perkel LLC",
  operatorUrl: "https://aaronperkel.com",
  operatorLocation: "Burlington, Vermont",
  /** What the operator is, for the privacy page's "Who runs this site". */
  operatorKind: "a Vermont limited liability company",
} as const;

/**
 * Who may sign in. A code is only ever sent to, and an account only ever
 * created for, an address that passes assertEmailAllowed() in src/lib/auth-allow.ts.
 * Add a school by adding its domain here.
 */
export const ALLOWED_EMAIL_DOMAINS = ["uvm.edu"] as const;

/** Who the site is for, in words, for the front page's note. Change with ALLOWED_EMAIL_DOMAINS. */
export const ACCESS = { audience: "UVM students" } as const;

/**
 * Exact-address exceptions to the domain rule: the admin's own address(es), from
 * NEXT_PUBLIC_ADMIN_EMAILS (comma-separated, .env.example) rather than the repo. Public
 * because the sign-in form runs the same allow check in the browser.
 */
export const ALLOWED_EMAILS: readonly string[] = (process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

/** Where admin notices (listing changes) and "Request your school" / "Request access" submissions go. */
export const ADMIN_INBOX: string | undefined = ALLOWED_EMAILS[0];

/**
 * Campus, for the distance filter and the 50-mile posting guard.
 * Waterman Building; the same point the legacy app used.
 */
export const CAMPUS = { lat: 44.477435, lon: -73.195323 } as const;

/** Posting limits. */
export const LIMITS = {
  photosPerListing: 25,
  uploadMaxBytes: 30 * 1024 * 1024,
  maxDistanceFromCampusMiles: 50,
  descriptionMaxChars: 4000,
  addressMaxChars: 255,
  displayNameMaxChars: 60,
  priceMax: 20000,
} as const;

/** One-time code settings; mirrored in the better-auth config. */
export const OTP = {
  length: 6,
  expiresInSeconds: 600,
  allowedAttempts: 3,
  /** No new code for the same address within this many seconds. */
  resendCooldownSeconds: 60,
  /** At most this many codes per address per hour. */
  perAddressPerHour: 5,
} as const;

/** The site this one replaces. */
export const LEGACY = {
  /** Named only in the one welcome message, so people recognise what moved. */
  name: "UVM Sublets",
} as const;

/** The author's other product. Named in the survey invitation's P.S. and in one survey question, nowhere else. */
export const ALSO_BY = {
  name: "Lejer",
  url: "https://uselejer.com",
  tagline: "a small app for splitting bills with roommates",
} as const;
