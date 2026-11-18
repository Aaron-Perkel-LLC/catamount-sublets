import type { Metadata } from "next";
import { SITE } from "@/config/site";
import { getDb } from "@/db";
import { PostEditor } from "@/components/post/PostEditor";
import { PostedBanner } from "@/components/post/PostedBanner";
import { ManagePanel } from "@/components/post/ManagePanel";
import { StatusBar } from "@/components/post/StatusBar";
import { OutsideMessagesToggle } from "@/components/post/OutsideMessagesToggle";
import { VisibilityNotice } from "@/components/post/VisibilityNotice";
import { ACCESS } from "@/config/site";
import { formatMoney } from "@/lib/format";
import { semesterLabel } from "@/lib/semesters";
import { shareUrl } from "@/lib/share";
import { visibilityControl } from "@/lib/visibility-rollout";
import type { ListingStatus } from "@/lib/options";
import { canPost } from "@/lib/viewer";
import { requireUser } from "@/server/auth";
import { viewerFor } from "@/server/viewer";
import Link from "next/link";
import { statsText } from "@/components/post/StatsLine";
import { posterStats } from "@/server/data/events";
import { myListing } from "@/server/data/my-listing";
import { activeSemesters } from "@/server/data/semesters";
import { storageMode } from "@/server/storage";

export const metadata: Metadata = { title: `My post · ${SITE.name}` };

/** Create or edit the signed-in person's one listing. */
export default async function PostPage({ searchParams }: { searchParams: Promise<{ posted?: string }> }) {
  const user = await requireUser("/post");
  // Community accounts can't post (the services refuse too); say so kindly instead of showing a form that would fail.
  if (!canPost(viewerFor(user).level)) return <PostingIsForStudents />;
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
        {listing && <VisibilityNotice control={visibilityControl(listing.row)} signedInOnly={listing.row.signedInOnly} />}
        {listing && !listing.row.signedInOnly && <OutsideMessagesToggle accepts={listing.row.acceptsOutsideMessages} />}
      </div>
      <PostEditor listing={listing} semesterOptions={options} accountEmail={user.email} uploadMode={storageMode()} />
      {listing && <ManagePanel status={listing.row.status as ListingStatus} />}
    </div>
  );
}

function PostingIsForStudents() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-3">
      <h1 className="text-2xl font-bold">Posting is for students</h1>
      <p className="text-ink-2">
        Listings come from {ACCESS.audience} only, so everyone browsing knows each one comes from a verified student. With your account you can still
        browse, save searches for weekly alerts, and message posters about their listings.
      </p>
      <p>
        <Link href="/browse" className="btn-primary inline-block px-3 py-2">
          Browse sublets
        </Link>
      </p>
    </div>
  );
}
