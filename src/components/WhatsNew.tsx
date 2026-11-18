"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import { easternDate } from "@/lib/dates";
import { showNewDot, WHATS_NEW_SEEN_KEY } from "@/lib/whats-new";

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

/**
 * The footer's What's new link, with a small dot when there's an entry this
 * browser hasn't seen. The server snapshot is "no dot", so the server render
 * and hydration agree; the browser's localStorage decides after that.
 */
export function WhatsNewLink({ dates, className }: { dates: readonly string[]; className: string }) {
  const dot = useSyncExternalStore(
    subscribe,
    () => {
      const seen = readSeen();
      return seen !== undefined && showNewDot(dates, easternDate(new Date()), seen);
    },
    () => false,
  );
  return (
    <Link href="/whats-new" className={`${className} inline-flex items-center gap-1`}>
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

/** On /whats-new: records the newest entry shown, which clears the footer's dot until a newer one appears. */
export function MarkWhatsNewSeen({ newest }: { newest: string | null }) {
  useEffect(() => {
    if (!newest) return;
    try {
      const seen = localStorage.getItem(WHATS_NEW_SEEN_KEY);
      if (!seen || newest > seen) localStorage.setItem(WHATS_NEW_SEEN_KEY, newest);
    } catch {
      // storage blocked: the dot is already off for this browser (WhatsNewLink)
    }
  }, [newest]);
  return null;
}
