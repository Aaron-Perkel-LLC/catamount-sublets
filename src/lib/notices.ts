import { z } from "zod";
import { assertIsoDate, easternDate } from "./dates";

/**
 * Popup notices (PLAN.md row 30): one admin-written popup at a time, shown to
 * each person in its audience until they dismiss it. Safe for both sides:
 * the admin form and its Server Actions share `noticeInput`, and the dialog
 * and the server share the URL and path rules.
 */

/** everyone: signed in or out; signed_in: any account; posters: an account with a listing. */
export const NOTICE_AUDIENCES = ["everyone", "signed_in", "posters"] as const;
export type NoticeAudience = (typeof NOTICE_AUDIENCES)[number];
export const NOTICE_AUDIENCE_LABELS: Record<NoticeAudience, string> = {
  everyone: "Everyone",
  signed_in: "Signed-in students",
  posters: "Posters (has a listing)",
};

/** view: the popup opened; dismiss: Got it, Escape or the backdrop; cta: the button. */
export const NOTICE_EVENT_TYPES = ["view", "dismiss", "cta"] as const;
export type NoticeEventType = (typeof NOTICE_EVENT_TYPES)[number];

export const NOTICE_LIMITS = { title: 80, body: 4000, ctaLabel: 40, ctaHref: 500 } as const;

/** Who is looking: what the server knows when it decides whether a notice goes out. */
export type NoticeViewer = { kind: "signed-out" } | { kind: "signed-in"; userId: string; hasListing: boolean };

export function audienceMatches(audience: NoticeAudience, viewer: NoticeViewer): boolean {
  if (audience === "everyone") return true;
  if (viewer.kind === "signed-out") return false;
  return audience === "signed_in" || viewer.hasListing;
}

/**
 * Pages a notice never opens on. Most of them render outside both frames and
 * never receive one; /admin is inside the signed-in frame, and a layout
 * outlives client-side navigation, so the dialog checks this on every path.
 */
const NO_NOTICE_ROOTS = ["/sign-in", "/welcome", "/admin", "/s", "/survey", "/outcome", "/unsubscribe"];
export function noticeShownOn(pathname: string): boolean {
  const path = pathname.split("?")[0];
  if (path === "/" || path === "") return false;
  return !NO_NOTICE_ROOTS.some((root) => path === root || path.startsWith(`${root}/`));
}

/** localStorage key for a signed-out visitor's dismissal. */
export const noticeDismissedKey = (id: number) => `notice:dismissed:${id}`;

// Whitespace, control characters and backslashes inside a relative path let a
// browser read "/\evil" or "/<tab>/evil" as "//evil", another host.
const UNSAFE_PATH_CHARS = /[\s\\\u0000-\u001f\u007f]/;

/** A same-site path: "/…" but not "//…", with nothing a browser would fold into a host. */
export function isRelativePath(href: string): boolean {
  return href.startsWith("/") && !href.startsWith("//") && !UNSAFE_PATH_CHARS.test(href);
}

function hasProtocol(href: string, allowed: readonly string[]): boolean {
  if (UNSAFE_PATH_CHARS.test(href)) return false;
  try {
    return allowed.includes(new URL(href).protocol);
  } catch {
    return false;
  }
}

/**
 * A link inside a notice body: http(s), mailto or a same-site path, or null
 * (the link is dropped and its text stays). react-markdown hands this the
 * decoded URL, so entity-encoded schemes are already plain text here.
 */
export function safeBodyHref(href: string): string | null {
  const h = href.trim();
  if (isRelativePath(h)) return h;
  return hasProtocol(h, ["http:", "https:", "mailto:"]) ? h : null;
}

/** The CTA button's target: a same-site path or https. */
export function safeCtaHref(href: string): boolean {
  return isRelativePath(href) || hasProtocol(href, ["https:"]);
}

export const isExternalHref = (href: string) => /^https?:\/\//i.test(href);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v));

/**
 * What the admin form sends. `endsOn` is an Eastern date: the notice stops
 * at the end of that day, like every other deadline on the site.
 */
export const noticeInput = z
  .object({
    title: z.string().trim().min(1, "Give it a title.").max(NOTICE_LIMITS.title, `At most ${NOTICE_LIMITS.title} characters.`),
    bodyMd: z.string().max(NOTICE_LIMITS.body, `At most ${NOTICE_LIMITS.body} characters.`),
    audience: z.enum(NOTICE_AUDIENCES),
    ctaLabel: optionalText(NOTICE_LIMITS.ctaLabel),
    ctaHref: optionalText(NOTICE_LIMITS.ctaHref),
    endsOn: z
      .string()
      .trim()
      .transform((v) => (v === "" ? null : v))
      .refine((v) => {
        if (v === null) return true;
        try {
          assertIsoDate(v);
          return true;
        } catch {
          return false;
        }
      }, "Not a date.")
      .refine((v) => v === null || v >= easternDate(new Date()), "That day has passed."),
  })
  .superRefine((v, ctx) => {
    if ((v.ctaLabel === null) !== (v.ctaHref === null)) {
      ctx.addIssue({ code: "custom", path: [v.ctaLabel === null ? "ctaLabel" : "ctaHref"], message: "A button needs both a label and a link." });
    }
    if (v.ctaHref !== null && !safeCtaHref(v.ctaHref)) {
      ctx.addIssue({ code: "custom", path: ["ctaHref"], message: "Use a path on this site (/browse) or an https:// link." });
    }
  });
export type NoticeInput = z.input<typeof noticeInput>;
export type NoticeValues = z.output<typeof noticeInput>;

/** What a viewer's dialog gets: never the audience, never who wrote it. */
export interface NoticeDto {
  id: number;
  title: string;
  bodyMd: string;
  ctaLabel: string | null;
  ctaHref: string | null;
}
