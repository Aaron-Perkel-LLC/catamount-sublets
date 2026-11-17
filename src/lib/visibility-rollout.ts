import { easternDayStart, nextDate } from "./dates";

/**
 * Who may keep a listing to signed-in students, and until when the posters
 * who never chose are told their listing is about to go public. Safe for
 * both sides: My post, the post form and the server all ask these.
 *
 * The plan changed after migration 0010 (17 Nov 2026). 0010 made every
 * listing that existed signed-in only; new ones default public. On 17 Nov
 * every poster was emailed that listings become visible to anyone from
 * 21 Nov unless they turn on "Only show to signed-in students" before then,
 * and that they can change it any time after. So:
 *
 * - posted before PUBLIC_BY_DEFAULT_SINCE: the poster keeps the switch;
 *   until GO_PUBLIC_DAY, a listing still signed-in only that its poster
 *   never chose (visibility_chosen_at null) is "pending" and My post says
 *   it goes public that day; `npm run go-public` makes those public then.
 * - posted from PUBLIC_BY_DEFAULT_SINCE on: public, no switch anywhere, and
 *   the server refuses to set it (setListingVisibility). Only an admin can.
 */

/**
 * When 0010 ran on Neon main (17 Nov 2026, 04:50 UTC; the restore branch
 * pre-0010-2026-11-17 is at 04:49:40 and the 0010 production deploy was
 * created at 04:51:06). Every listing posted before it was made signed-in
 * only; none was posted between 16 Nov 23:42 UTC and this. The one cutoff:
 * drizzle/0011_*.sql repeats it as a literal, and a test holds them equal.
 */
export const PUBLIC_BY_DEFAULT_SINCE = new Date("2026-11-17T04:50:00Z");

/** The Eastern date in the 17 Nov email: from 00:00 that day, listings are visible to anyone. */
export const GO_PUBLIC_DAY = "2026-11-21";
export const GO_PUBLIC_AT = easternDayStart(GO_PUBLIC_DAY);
/** How My post names that day. */
export const GO_PUBLIC_DAY_WORDS = "Nov 21";
/**
 * The one-off cron (/api/cron/go-public, vercel.json "5 5 21 11 *" = 00:05
 * Eastern on 21 Nov, EST) acts only from GO_PUBLIC_AT until the end of this
 * Eastern day; the same schedule next year, or a manual run later, does nothing.
 */
export const GO_PUBLIC_CRON_LAST_DAY = "2026-11-22";
export const GO_PUBLIC_CRON_UNTIL = easternDayStart(nextDate(GO_PUBLIC_CRON_LAST_DAY));

/** Whether the poster (not an admin) may switch this listing between public and signed-in only. */
export function posterMayChooseVisibility(postedAt: Date): boolean {
  return postedAt.getTime() < PUBLIC_BY_DEFAULT_SINCE.getTime();
}

/**
 * What My post shows for a listing:
 * - "none": posted after the cutoff; no switch, only a line saying who sees it.
 * - "pending": signed-in only because 0010 made it so, its poster has not
 *   chosen, and the go-public day has not come: "becomes visible on Nov 21",
 *   with "Only show to signed-in students" / "Make it public now".
 * - "switch": the normal switch.
 */
export type VisibilityControl = "none" | "pending" | "switch";

export function visibilityControl(
  row: { postedAt: Date; signedInOnly: boolean; visibilityChosenAt: Date | null },
  now: Date = new Date(),
): VisibilityControl {
  if (!posterMayChooseVisibility(row.postedAt)) return "none";
  if (row.signedInOnly && row.visibilityChosenAt === null && now.getTime() < GO_PUBLIC_AT.getTime()) return "pending";
  return "switch";
}

/** The line shown wherever a poster is told what signed-out visitors see (My post, the post form). */
export const SIGNED_OUT_SEE =
  "price, semester, size, utilities, amenities, photos and the rough neighborhood — never your name, contact, address, pin, title or description";
