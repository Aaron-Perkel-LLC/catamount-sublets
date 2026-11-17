"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { GO_PUBLIC_DAY_WORDS, SIGNED_OUT_SEE, type VisibilityControl } from "@/lib/visibility-rollout";
import { setMyListingVisibility } from "@/server/actions/post";

/**
 * My post, under the status: whether people who are not signed in can find
 * the listing. `control` comes from visibilityControl() on the server:
 * - "pending": 0010 made it signed-in only and its poster never chose, so it
 *   goes public on the go-public day. Not shown as switched on; two buttons,
 *   either of which records the choice. The keep button is worded as the
 *   17 Nov email named the setting: "Only show to signed-in students".
 * - "switch": the one-click switch, either way.
 * - "none": posted after the cutoff, so there is no switch, just who sees it.
 */
export function VisibilityNotice({ control, signedInOnly }: { control: VisibilityControl; signedInOnly: boolean }) {
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

  const box = "flex flex-col gap-2 rounded-lg border border-line bg-paper px-3 py-2 text-sm";

  if (control === "pending") {
    return (
      <div className={box}>
        <p className="text-ink">
          <strong>Your listing becomes visible to signed-out visitors on {GO_PUBLIC_DAY_WORDS}.</strong> They&apos;ll see {SIGNED_OUT_SEE}.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary px-3 py-2 text-sm" disabled={pending} onClick={() => set(true)}>
            {pending ? "Working…" : "Only show to signed-in students"}
          </button>
          <button type="button" className="btn-primary px-3 py-2 text-sm" disabled={pending} onClick={() => set(false)}>
            {pending ? "Working…" : "Make it public now"}
          </button>
        </div>
        {error && <p className="text-error-ink">{error}</p>}
      </div>
    );
  }

  if (control === "none") {
    return (
      <div className={box}>
        <p className="text-ink-2">
          {signedInOnly
            ? "Only signed-in students see this."
            : `Anyone can find this without signing in. They see the ${SIGNED_OUT_SEE}.`}
        </p>
      </div>
    );
  }

  return (
    <div className={`${box} sm:flex-row sm:items-center sm:justify-between`}>
      {signedInOnly ? (
        <>
          <p className="text-ink">
            <strong>Only signed-in students see this.</strong> Show it publicly? Signed-out visitors would see the {SIGNED_OUT_SEE}.
          </p>
          <button type="button" className="btn-primary shrink-0 px-3 py-2 text-sm" disabled={pending} onClick={() => set(false)}>
            {pending ? "Working…" : "Show it publicly"}
          </button>
        </>
      ) : (
        <>
          <p className="text-ink-2">Anyone can find this without signing in. They see the {SIGNED_OUT_SEE}.</p>
          <button type="button" className="btn-secondary shrink-0 px-3 py-2 text-sm" disabled={pending} onClick={() => set(true)}>
            {pending ? "Working…" : "Only signed-in students"}
          </button>
        </>
      )}
      {error && <p className="text-error-ink">{error}</p>}
    </div>
  );
}
