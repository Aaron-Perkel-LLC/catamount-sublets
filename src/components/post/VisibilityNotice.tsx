"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setMyListingVisibility } from "@/server/actions/post";

/**
 * My post, under the status: whether people who are not signed in can find
 * the listing, with a one-click switch. Listings posted before signed-out
 * browsing start as signed-in only, so this is how their posters find out.
 */
export function VisibilityNotice({ signedInOnly }: { signedInOnly: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const set = (next: boolean) =>
    start(async () => {
      setError(null);
      const r = await setMyListingVisibility(next);
      if (!r.ok) setError(r.error ?? "Couldn’t change that.");
      else router.refresh();
    });

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line bg-paper px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
      {signedInOnly ? (
        <>
          <p className="text-ink">
            <strong>Only signed-in students see this.</strong> Show it publicly? People who aren&apos;t signed in would see the photos, price
            and details, and a circle around your place, never the address, your name or how to reach you.
          </p>
          <button type="button" className="btn-primary shrink-0 px-3 py-2 text-sm" disabled={pending} onClick={() => set(false)}>
            {pending ? "Working…" : "Show it publicly"}
          </button>
        </>
      ) : (
        <>
          <p className="text-ink-2">
            Anyone can find this without signing in, without the address, your name or how to reach you.
          </p>
          <button type="button" className="btn-secondary shrink-0 px-3 py-2 text-sm" disabled={pending} onClick={() => set(true)}>
            {pending ? "Working…" : "Only signed-in students"}
          </button>
        </>
      )}
      {error && <p className="text-error-ink">{error}</p>}
    </div>
  );
}
