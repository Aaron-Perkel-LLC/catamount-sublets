/**
 * The admin's type and spacing system, defined once. Every admin page is
 * built from these and the components beside this file; nothing under
 * /admin sets its own card, label or control style.
 *
 * Grid      8 px: gaps are 8 / 12 / 16 / 24 (gap-2 / 3 / 4 / 6); card padding 16.
 * Title     one per page, 20/28 bold (PageHeader).
 * Card      paper, 12 px radius, a soft shadow and no border; hairline
 *           (line-light) dividers inside. Shadows separate cards, borders
 *           separate controls: never both on one thing.
 * Card head 13 px bold.
 * Label     12 px ink-3; a group header is 11 px bold caps, tracked.
 * Body      14 px (13 px in tables and lists).
 * Numbers   30/32 bold for a KPI, 14 bold in lists and tables; always
 *           tabular figures.
 * Controls  8 px radius, 32 px tall with a pointer, 44 px on a phone (md is
 *           the line). Fields stay 16 px type on a phone so iOS doesn't zoom.
 * Pills     20 px tall, 6 px radius, 11 px bold.
 * Words     explanations live behind an ⓘ (Tip), never as a sentence under a number.
 */

export const CARD = "rounded-xl bg-paper shadow-[0_1px_2px_rgb(28_35_40/0.07),0_4px_12px_rgb(28_35_40/0.04)]";
export const CARD_TITLE = "text-[13px] leading-5 font-bold text-ink";
export const LABEL = "text-xs text-ink-3";
export const GROUP = "text-[11px] font-bold tracking-wider text-ink-3 uppercase";
export const MUTED = "text-[13px] text-ink-3";
/** A number in a list or table; `ZERO` for a nought, so the eye skips it. */
export const NUM = "font-bold tabular-nums text-ink";
export const ZERO = "tabular-nums text-ink-3/70";

const CONTROL = "inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 text-[13px] font-bold whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50 md:h-8";
export const BTN = `${CONTROL} border border-line bg-paper text-ink hover:border-lake hover:text-lake`;
export const BTN_PRIMARY = `${CONTROL} bg-lake text-paper hover:bg-lake-deep`;
export const BTN_DANGER = `${CONTROL} border border-error-line bg-paper text-error-ink hover:bg-error-tint`;
/** A text-weight action inside a row or a sentence; still 44 px to tap on a phone. */
export const LINK = "inline-flex min-h-11 items-center text-[13px] font-bold text-lake underline-offset-2 hover:underline disabled:opacity-50 md:min-h-0";
export const FIELD = "h-11 w-full rounded-lg border border-line bg-paper px-3 text-base text-ink placeholder:text-ink-3 hover:border-lake focus:border-lake md:h-9 md:text-sm";
/** A dropdown: the site's select (its own chevron, the phone's native picker) at the admin's control height. */
export const SELECT = "field h-11 py-0 text-base md:h-9 md:text-sm";
export const TEXTAREA = "w-full rounded-lg border border-line bg-paper px-3 py-2 text-base text-ink placeholder:text-ink-3 hover:border-lake focus:border-lake md:text-sm";
export const FIELD_LABEL = "flex flex-col gap-1 text-xs text-ink-3";

/** A square button holding only an icon (give it an aria-label): 44 px on a phone, 24 px in a dense row with a pointer. */
const ICON_BASE = "grid h-11 w-11 shrink-0 place-items-center rounded-lg border bg-paper disabled:cursor-not-allowed disabled:opacity-40 md:h-6 md:w-6 md:rounded-md";
export const ICON_BTN = `${ICON_BASE} border-line text-ink-2 hover:border-lake hover:text-lake`;
export const ICON_BTN_DANGER = `${ICON_BASE} border-error-line text-error-ink hover:bg-error-tint`;
/** A radio or checkbox with its words, as one tappable row. */
export const CHOICE = "flex min-h-11 items-center gap-2 text-[13px] text-ink md:min-h-8";
/** A modal <dialog>'s frame (Find, the archive and ask-posters confirmations). */
export const DIALOG = "m-auto w-[min(36rem,calc(100vw-2rem))] rounded-xl border border-line bg-paper p-0 text-ink shadow-xl backdrop:bg-ink/60";

export const num = (n: number) => n.toLocaleString("en-US");
