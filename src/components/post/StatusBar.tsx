"use client";

import { Eye, Share2 } from "lucide-react";
import Link from "next/link";
import { useShareSheet } from "@/components/share/share-sheet";
import type { ListingStatus } from "@/lib/options";

type State = { label: string; tone: "live" | "off" | "taken"; detail: string };

/** Where the listing stands, in one line, from its status, photos and semesters. */
export function listingState(status: ListingStatus, photos: number, hidden: boolean): State {
  if (status === "taken") return { label: "Taken", tone: "taken", detail: "Off the board. Put it back up under Manage if that changes." };
  if (status === "paused") return { label: "Paused", tone: "off", detail: "Saved but off the board until you resume it under Manage." };
  if (photos === 0) return { label: "Not live yet", tone: "off", detail: "It goes on the board once it has a photo." };
  if (hidden) return { label: "Not on the board", tone: "off", detail: "Its semester is closed. Pick an open one under Details." };
  return { label: "Live", tone: "live", detail: "On Browse and the Map." };
}

const TONE: Record<State["tone"], string> = {
  live: "border-included-line bg-included-tint text-included-ink",
  off: "border-tenant-line bg-tenant-tint text-tenant-ink",
  taken: "border-line bg-line-light text-ink-2",
};

/**
 * The top of My post: the listing's state, its totals, View listing, and
 * Share while it is live (a share link to a listing off the board says it is
 * unavailable, so the button would only disappoint).
 */
export function StatusBar({
  listingId,
  status,
  photos,
  hidden,
  stats,
  share,
}: {
  listingId: number;
  status: ListingStatus;
  photos: number;
  hidden: boolean;
  stats: string;
  share: { url: string; price: string; semester: string };
}) {
  const { open } = useShareSheet();
  const state = listingState(status, photos, hidden);
  return (
    <section aria-label="Listing status" className="flex flex-col gap-3 rounded-xl border border-line bg-paper p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-sm font-bold ${TONE[state.tone]}`}>
            {state.tone === "live" && <span className="h-2 w-2 rounded-full bg-included-ink" aria-hidden />}
            {state.label}
          </span>
          <span className="text-sm text-ink-2">{state.detail}</span>
        </p>
        <p className="text-xs text-ink-3">{stats}</p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <Link href={`/listing/${listingId}`} className="btn-secondary gap-2 py-2">
          <Eye className="h-4 w-4" aria-hidden /> View listing
        </Link>
        {state.tone === "live" && (
          <button type="button" className="btn-primary gap-2 py-2" onClick={() => open({ ...share, listingId, source: "post" })}>
            <Share2 className="h-4 w-4" aria-hidden /> Share
          </button>
        )}
      </div>
    </section>
  );
}
