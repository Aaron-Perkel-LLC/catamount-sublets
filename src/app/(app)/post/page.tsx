import type { Metadata } from "next";
import { SITE } from "@/config/site";
import { getDb } from "@/db";
import { PostEditor } from "@/components/post/PostEditor";
import { PostedBanner } from "@/components/post/PostedBanner";
import { ManagePanel } from "@/components/post/ManagePanel";
import { StatusBar } from "@/components/post/StatusBar";
import { formatMoney } from "@/lib/format";
import { semesterLabel } from "@/lib/semesters";
import { shareUrl } from "@/lib/share";
import type { ListingStatus } from "@/lib/options";
import { requireUser } from "@/server/auth";
import { statsText } from "@/components/post/StatsLine";
import { posterStats } from "@/server/data/events";
import { myListing } from "@/server/data/my-listing";
import { activeSemesters } from "@/server/data/semesters";
import { storageMode } from "@/server/storage";

export const metadata: Metadata = { title: `My post · ${SITE.name}` };

/** Create or edit the signed-in person's one listing. */
export default async function PostPage({ searchParams }: { searchParams: Promise<{ posted?: string }> }) {
  const user = await requireUser("/post");
  const db = await getDb();
  const [listing, active] = await Promise.all([myListing(db, user.id), activeSemesters(db)]);

  // Open semesters in calendar order, plus any closed one the listing already has, ticked and labelled.
  const options = [
    ...active.map((s) => ({ code: s.code, name: s.name, active: true })),
    ...(listing?.semesters.filter((s) => !s.active).map((s) => ({ code: s.code, name: s.name, active: false })) ?? []),
  ];
  const hidden = listing ? listing.semesters.every((s) => !s.active) : false;
  const stats = listing ? await posterStats(db, listing.row.id, listing.row.postedAt) : null;
  const justPosted = Boolean(listing && (await searchParams).posted);
  const missing = !listing
    ? null
    : listing.photos.length === 0
      ? "It goes live once it has a photo. Add one under Photos."
      : hidden
        ? "Its semester is closed, so it isn't on the board. Pick an open semester under Details."
        : listing.row.status !== "open"
          ? "It's paused, so it isn't on the board. Resume it under Manage."
          : null;

  // Same order on every screen: where it stands, photos, details, then the status changes and Delete.
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold">{listing ? "My post" : "New post"}</h1>
        {justPosted && <PostedBanner live={missing === null} missing={missing} />}
        {listing && (
          <StatusBar
            listingId={listing.row.id}
            status={listing.row.status as ListingStatus}
            photos={listing.photos.length}
            hidden={hidden}
            stats={stats ? statsText({ ...stats, since: listing.row.postedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" }) }) : ""}
            share={{
              url: shareUrl(listing.row.id),
              price: formatMoney(listing.row.price),
              semester: semesterLabel(listing.semesters.filter((s) => s.active).map((s) => s.name)),
            }}
          />
        )}
      </div>
      <PostEditor listing={listing} semesterOptions={options} accountEmail={user.email} uploadMode={storageMode()} />
      {listing && <ManagePanel status={listing.row.status as ListingStatus} />}
    </div>
  );
}
