"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import type { EventSource } from "@/lib/options";
import { track } from "@/lib/track";
import type { ListingDto } from "@/server/data/listings";
import { type BoardListing, isPublicListing } from "./board-listing";
import { ListingModal } from "./ListingModal";
import { PublicListingModal } from "./PublicListingModal";

/**
 * Who is looking, for the parts of the view that depend on it: the email
 * draft signs with a real name only, and the owner sees Edit instead of
 * Email / Call (the DTO's isMine decides that; this is for copy).
 */
export interface Viewer {
  /** The name to sign an email with, or null when it is just the email's local part. */
  signature: string | null;
  isAdmin: boolean;
}

interface ListingViewApi {
  open: (listing: BoardListing, source: EventSource) => void;
  /** Swap in a fresher copy of the listing that is open (after an admin edit), with no history entry or view counted. */
  refresh: (listing: BoardListing) => void;
  close: () => void;
  current: BoardListing | null;
}

const Ctx = createContext<ListingViewApi | null>(null);

/**
 * Owns the one listing view on a page. Opening pushes a history entry so a
 * phone's Back closes it; close() steps back over that entry and the popstate
 * handler hides the view. Close through close(), never by hiding the overlay.
 */
export function ListingViewProvider({
  children,
  viewer,
  actions: Actions,
}: {
  children: ReactNode;
  /** Null for a signed-out visitor, whose listings are all PublicListing and open in the public view. */
  viewer: Viewer | null;
  /** Extra controls at the top of the view; the admin page's status, photos and delete. */
  actions?: ComponentType<{ listing: ListingDto; close: () => void }>;
}) {
  const [current, setCurrent] = useState<BoardListing | null>(null);
  const [source, setSource] = useState<EventSource>("browse");
  const pushed = useRef(false);
  const lastFocused = useRef<HTMLElement | null>(null);

  const hide = useCallback(() => {
    setCurrent(null);
    pushed.current = false;
    const el = lastFocused.current;
    if (el && document.contains(el)) el.focus();
  }, []);

  const open = useCallback((listing: BoardListing, from: EventSource) => {
    lastFocused.current = document.activeElement as HTMLElement | null;
    setSource(from);
    setCurrent(listing);
    track("listing_open", listing.id, from);
    history.pushState({ ...history.state, listing: listing.id }, "", window.location.href);
    pushed.current = true;
  }, []);

  const refresh = useCallback((listing: BoardListing) => {
    setCurrent((c) => (c && c.id === listing.id ? listing : c));
  }, []);

  const close = useCallback(() => {
    if (pushed.current && history.state?.listing) history.back();
    else hide();
  }, [hide]);

  useEffect(() => {
    const onPop = () => hide();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [hide]);

  useEffect(() => {
    if (!current) return;
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = prev;
    };
  }, [current]);

  const api = useMemo(() => ({ open, refresh, close, current }), [open, refresh, close, current]);

  return (
    <Ctx.Provider value={api}>
      {children}
      {current &&
        (isPublicListing(current) ? (
          <PublicListingModal key={current.id} listing={current} onClose={close} />
        ) : (
          viewer && <ListingModal key={current.id} listing={current} source={source} viewer={viewer} onClose={close} actions={Actions && <Actions listing={current} close={close} />} />
        ))}
    </Ctx.Provider>
  );
}

export function useListingView(): ListingViewApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useListingView outside ListingViewProvider");
  return ctx;
}
