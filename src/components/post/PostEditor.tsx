"use client";

import { useRef, useState } from "react";
import type { MyListing } from "@/server/data/my-listing";
import { PhotoManager, type PhotoManagerHandle } from "./PhotoManager";
import { PostForm } from "./PostForm";
import type { SemesterPill } from "./SemesterPicker";

/**
 * Photos, then the details, as one flow. On a new post the photos are picked
 * first and held in the browser; the first save creates the listing, the page
 * scrolls back up to the photos, and they upload there with their progress.
 */
export function PostEditor({
  listing,
  semesterOptions,
  accountEmail,
  uploadMode,
}: {
  listing: MyListing | null;
  semesterOptions: SemesterPill[];
  accountEmail: string;
  uploadMode: "blob" | "local";
}) {
  const photos = useRef<PhotoManagerHandle>(null);
  const [ready, setReady] = useState(0);

  async function onCreated(listingId: number): Promise<number> {
    document.getElementById("photos")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return (await photos.current?.uploadPending(listingId)) ?? 0;
  }

  return (
    <>
      <section id="photos" aria-labelledby="photos-heading" className="flex scroll-mt-4 flex-col gap-3">
        <h2 id="photos-heading" className="text-lg font-bold">
          Photos
        </h2>
        <PhotoManager ref={photos} listingId={listing?.row.id ?? null} initial={listing?.photos ?? []} uploadMode={uploadMode} onPendingChange={setReady} />
      </section>
      <section aria-labelledby="details-heading" className="flex flex-col gap-3">
        <h2 id="details-heading" className="text-lg font-bold">
          Details
        </h2>
        <PostForm listing={listing} semesterOptions={semesterOptions} accountEmail={accountEmail} onCreated={onCreated} photosReady={ready} />
      </section>
    </>
  );
}
