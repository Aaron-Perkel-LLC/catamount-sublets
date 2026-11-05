"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ListingStatus } from "@/lib/options";
import { deleteMyListing, setMyListingStatus } from "@/server/actions/post";

type Confirming = "taken" | "delete" | null;

/**
 * The bottom of My post: status changes, then Delete on its own below a rule.
 * Marking as taken and deleting ask first, in place; pausing and resuming are
 * one tap because they undo each other.
 */
export function ManagePanel({ status }: { status: ListingStatus }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Confirming>(null);

  const set = (next: ListingStatus) =>
    start(async () => {
      setConfirming(null);
      const r = await setMyListingStatus(next);
      if (!r.ok) setError(r.error ?? "Couldn’t change that.");
      else router.refresh();
    });

  const remove = () =>
    start(async () => {
      const r = await deleteMyListing();
      if (r && !r.ok) setError(r.error ?? "Couldn’t delete that.");
    });

  return (
    <section aria-labelledby="manage-heading" className="flex flex-col gap-3">
      <h2 id="manage-heading" className="text-lg font-bold">
        Manage
      </h2>
      <div className="flex flex-col gap-4 rounded-xl border border-line bg-paper p-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {status === "open" && (
              <>
                <button type="button" className="btn-secondary" disabled={pending} onClick={() => setConfirming("taken")}>
                  Mark as taken
                </button>
                <button type="button" className="btn-secondary" disabled={pending} onClick={() => set("paused")}>
                  Pause
                </button>
              </>
            )}
            {status === "paused" && (
              <>
                <button type="button" className="btn-primary" disabled={pending} onClick={() => set("open")}>
                  Resume
                </button>
                <button type="button" className="btn-secondary" disabled={pending} onClick={() => setConfirming("taken")}>
                  Mark as taken
                </button>
              </>
            )}
            {status === "taken" && (
              <button type="button" className="btn-primary" disabled={pending} onClick={() => set("open")}>
                Put it back up
              </button>
            )}
          </div>
          <p className="text-xs text-ink-3">Pausing takes it off the board until you resume. Taken means you found someone.</p>
          {confirming === "taken" && (
            <Confirm
              text="Mark your listing as taken? It comes off the board; you can put it back up later."
              action="Mark as taken"
              pending={pending}
              onConfirm={() => set("taken")}
              onCancel={() => setConfirming(null)}
            />
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-line pt-4">
          {confirming === "delete" ? (
            <Confirm
              danger
              text="Delete your listing and its photos? This can't be undone."
              action="Delete listing"
              pending={pending}
              onConfirm={remove}
              onCancel={() => setConfirming(null)}
            />
          ) : (
            <button
              type="button"
              className="self-start rounded-lg border border-error-line bg-error-tint px-4 py-2.5 font-bold text-error-ink hover:bg-error-line disabled:opacity-60"
              disabled={pending}
              onClick={() => setConfirming("delete")}
            >
              Delete listing
            </button>
          )}
        </div>
        {error && <p className="text-sm text-error-ink">{error}</p>}
      </div>
    </section>
  );
}

function Confirm({
  text,
  action,
  danger = false,
  pending,
  onConfirm,
  onCancel,
}: {
  text: string;
  action: string;
  danger?: boolean;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      role="alertdialog"
      aria-label={action}
      className={`flex flex-col gap-3 rounded-lg border p-3 ${danger ? "border-error-line bg-error-tint" : "border-line bg-cream"}`}
    >
      <p className={`text-sm ${danger ? "text-error-ink" : "text-ink"}`}>{text}</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          autoFocus
          className={danger ? "rounded-lg bg-error-ink px-4 py-2.5 font-bold text-paper hover:opacity-90 disabled:opacity-60" : "btn-primary"}
          disabled={pending}
          onClick={onConfirm}
        >
          {pending ? "Working…" : action}
        </button>
        <button type="button" className="btn-secondary" disabled={pending} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
