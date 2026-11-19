"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { withFrom } from "@/lib/back-link";
import { isNewer, showNewDot, WHATS_NEW_SEEN_KEY } from "@/lib/whats-new";

/** Set by /whats-new in this page session, whether or not storage took it: the dot stays off until a reload. */
let seenThisSession = false;

function readSeen(): string | null | undefined {
  try {
    return localStorage.getItem(WHATS_NEW_SEEN_KEY);
  } catch {
    return undefined; // storage blocked: no dot, rather than one that never goes away
  }
}

/** Another tab visiting /whats-new updates this one. */
function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

/** A footer link to `href` that carries the current page, so the page it opens links back here (src/lib/back-link.ts). */
function useBackTo(href: string): string {
  const pathname = usePathname();
  const params = useSearchParams();
  return withFrom(href, pathname, params.toString());
}

/** The footer's Privacy link. */
export function PrivacyLink({ className }: { className: string }) {
  return (
    <Link href={useBackTo("/privacy")} className={className}>
      Privacy
    </Link>
  );
}

/**
 * The footer's What's new link, with a small dot when there's an entry this
 * browser hasn't seen. `latest` and `today` come from the server render
 * (latestMarker, Eastern), so the browser's clock can't disagree with the
 * page. The server snapshot is "no dot", so the server render and hydration
 * agree; localStorage decides after that.
 */
export function WhatsNewLink({ latest, today, className }: { latest: string | null; today: string; className: string }) {
  const dot = useSyncExternalStore(
    subscribe,
    () => {
      if (seenThisSession) return false;
      const seen = readSeen();
      return seen !== undefined && showNewDot(latest, today, seen);
    },
    () => false,
  );
  const href = useBackTo("/whats-new");
  return (
    <Link href={href} className={`${className} inline-flex items-center gap-1`}>
      What&apos;s new
      {dot && (
        <>
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-maple" />
          <span className="sr-only">(new)</span>
        </>
      )}
    </Link>
  );
}

/** On /whats-new: records the newest entry shown (its latestMarker), which clears the footer's dot until a newer one appears. */
export function MarkWhatsNewSeen({ latest }: { latest: string | null }) {
  useEffect(() => {
    if (!latest) return;
    seenThisSession = true;
    try {
      const seen = localStorage.getItem(WHATS_NEW_SEEN_KEY);
      if (!seen || isNewer(latest, seen)) localStorage.setItem(WHATS_NEW_SEEN_KEY, latest);
    } catch {
      // storage that can't be written: seenThisSession keeps the dot off for this page session
    }
  }, [latest]);
  return null;
}
