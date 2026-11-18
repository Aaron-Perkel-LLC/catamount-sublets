"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useId, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { isRelativePath, noticeDismissedKey, noticeShownOn, type NoticeDto, safeCtaHref } from "@/lib/notices";
import { trackNotice } from "@/lib/track";
import { dismissNoticeAction } from "@/server/actions/notices";

/**
 * Notices already shown or dismissed in this page session (cleared by a
 * reload). The frame outlives client-side navigation, and when localStorage
 * throws for a signed-out visitor this is what keeps it to once.
 */
const handled = new Set<number>();

/** "yes", "no", or "unavailable" when storage throws (private mode, blocked site data). */
function storedDismissal(id: number): "yes" | "no" | "unavailable" {
  try {
    return window.localStorage.getItem(noticeDismissedKey(id)) ? "yes" : "no";
  } catch {
    return "unavailable";
  }
}

function storeDismissal(id: number): void {
  try {
    window.localStorage.setItem(noticeDismissedKey(id), new Date().toISOString());
  } catch {
    /* `handled` covers this page session */
  }
}

/**
 * The card itself: title, the rendered body, an optional CTA and Got it. The
 * live popup and the admin preview both render this, so the preview is the
 * real thing. Without handlers (the preview) the buttons do nothing.
 */
export function NoticeCard({
  notice,
  body,
  titleId,
  onGotIt,
  onCta,
}: {
  notice: Pick<NoticeDto, "title" | "ctaLabel" | "ctaHref">;
  body: ReactNode;
  titleId?: string;
  onGotIt?: () => void;
  onCta?: () => void;
}) {
  return (
    <div className="max-h-[85dvh] w-full overflow-y-auto rounded-t-2xl bg-paper p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl sm:rounded-2xl sm:pb-5">
      <h2 id={titleId} className="text-lg font-bold text-ink">
        {notice.title}
      </h2>
      <div className="mt-3">{body}</div>
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" className={notice.ctaLabel ? "btn-secondary" : "btn-primary"} onClick={() => onGotIt?.()}>
          Got it
        </button>
        {notice.ctaLabel && notice.ctaHref && safeCtaHref(notice.ctaHref) && (
          <a
            href={notice.ctaHref}
            className="btn-primary text-center"
            onClick={(e: MouseEvent) => {
              e.preventDefault();
              onCta?.();
            }}
          >
            {notice.ctaLabel}
          </a>
        )}
      </div>
    </div>
  );
}

/**
 * The popup. The server has already decided this viewer is in the notice's
 * audience (and, signed in, hasn't dismissed it); here it waits until the
 * page has painted, skips the pages notices never open on, and for a
 * signed-out visitor checks localStorage. A dialog: labelled by its title,
 * focus moves in and stays in, Escape, the backdrop and any link in the body
 * dismiss, and focus goes back where it was. A navigation while it is open
 * (the frame outlives client-side navigation) closes it without dismissing.
 */
export function NoticePopup({ notice, signedIn, children }: { notice: NoticeDto; signedIn: boolean; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const visible = open && noticeShownOn(pathname);

  // A navigation it didn't start closes it, not dismissed: it shows again after a reload (state adjusted during render, the React way).
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    if (open) setOpen(false);
  }

  /** Closes it for good: the dismissal row (signed in) or localStorage (signed out), and its count. */
  function dismiss(how: "dismiss" | "cta"): Promise<unknown> {
    handled.add(notice.id);
    setOpen(false);
    if (signedIn) return dismissNoticeAction(notice.id, how).catch(() => undefined);
    storeDismissal(notice.id);
    trackNotice(how, notice.id);
    return Promise.resolve();
  }
  const onEscape = useEffectEvent(() => void dismiss("dismiss"));

  useEffect(() => {
    if (handled.has(notice.id)) return;
    // Signed out, this is the dismissal; signed in it's only a one-off from before signing in on this browser.
    if (storedDismissal(notice.id) === "yes") return;
    // After the page has painted, not over it.
    const t = window.setTimeout(() => setOpen(true), 500);
    return () => window.clearTimeout(t);
  }, [notice.id, signedIn]);

  // Shown: count the view once, lock the page behind it, move focus in, and keep it there.
  useEffect(() => {
    if (!visible) return;
    if (!handled.has(notice.id)) {
      handled.add(notice.id);
      trackNotice("view", notice.id);
    }
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.current?.focus();
    const prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onEscape();
      } else if (e.key === "Tab" && dialog.current) {
        const focusable = [...dialog.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')];
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const at = document.activeElement;
        if (e.shiftKey && (at === first || at === dialog.current)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && at === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = prevOverflow;
      // However it hides (dismissed, or a navigation to a page it never shows on), focus goes back.
      const back = returnFocus.current;
      if (back && back.isConnected) back.focus();
    };
  }, [visible, notice.id]);

  async function cta() {
    const href = notice.ctaHref;
    // Let the dismissal land before leaving (briefly; navigating matters more).
    await Promise.race([dismiss("cta"), new Promise((r) => setTimeout(r, 1500))]);
    // Checked again here: only a path on this site (client navigation) or an https page, never a script URL.
    if (!href || !safeCtaHref(href)) return;
    if (isRelativePath(href)) router.push(href);
    else if (new URL(href).protocol === "https:") window.location.assign(href);
  }

  /** Leaves for a path here once the dismissal has landed (briefly; navigating matters more). */
  async function leaveFor(href: string) {
    await Promise.race([dismiss("dismiss"), new Promise((r) => setTimeout(r, 1500))]);
    router.push(href);
  }

  /**
   * A link in the body dismisses it, as Got it does (counted as a dismissal,
   * not a CTA click). A plain click on a path here goes through the router
   * after the dismissal; anything else (a new tab, an external page, mailto)
   * is left to the browser.
   */
  function onBodyClick(e: MouseEvent<HTMLDivElement>) {
    const a = e.target instanceof Element ? e.target.closest("a[href]") : null;
    if (!(a instanceof HTMLAnchorElement) || !e.currentTarget.contains(a)) return;
    const href = a.getAttribute("href") ?? "";
    const plain = e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && a.target !== "_blank";
    if (plain && isRelativePath(href)) {
      e.preventDefault();
      void leaveFor(href);
    } else {
      void dismiss("dismiss");
    }
  }

  if (!visible) return null;
  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/60 sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) void dismiss("dismiss");
      }}
    >
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="w-full max-w-md outline-none">
        <NoticeCard notice={notice} body={<div onClick={onBodyClick}>{children}</div>} titleId={titleId} onGotIt={() => void dismiss("dismiss")} onCta={() => void cta()} />
      </div>
    </div>
  );
}
