import type { EventSource, EventType, ShareTarget } from "./options";

/**
 * The activity beacon. One POST per event; the server decides what counts
 * (src/app/api/events). sendBeacon survives navigation (a tap on "Call"
 * leaves the page); fetch with keepalive is the fallback. Fire and forget.
 */
export function track(type: EventType, listingId: number, source?: EventSource | null, target?: ShareTarget): void {
  if (typeof window === "undefined" || !listingId) return;
  const body = new URLSearchParams({ type, listing_id: String(listingId) });
  if (source) body.set("source", source);
  if (target) body.set("target", target);
  try {
    if (navigator.sendBeacon && navigator.sendBeacon("/api/events", body)) return;
  } catch {
    /* fall through */
  }
  void fetch("/api/events", { method: "POST", body, keepalive: true, credentials: "same-origin" }).catch(() => {});
}
