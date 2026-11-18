import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Gallery } from "@/components/listings/Gallery";
import { PublicListingDetails } from "@/components/listings/PublicListingDetails";
import { ViewBeacon } from "@/components/listings/ViewBeacon";
import { SITE } from "@/config/site";
import { getDb } from "@/db";
import { formatMiles } from "@/lib/distance-format";
import { formatMoney } from "@/lib/format";
import { getViewer } from "@/server/viewer";
import { publicListingById, type PublicListing } from "@/server/data/public-listings";

const listingId = (raw: string) => {
  const n = Number.parseInt(raw, 10);
  return Number.isInteger(n) && n > 0 && String(n) === raw ? n : null;
};

/** Only a listing on the signed-out board, and only for a signed-out request. */
async function publicListing(raw: string): Promise<PublicListing | null> {
  const id = listingId(raw);
  return id ? publicListingById(await getDb(), id) : null;
}

/** Built from PublicListing only: no address, poster or contact in the title, description or preview. */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  if ((await getViewer()).user) return {};
  const l = await publicListing((await params).id);
  if (!l) return { title: `Listing not found · ${SITE.name}`, robots: { index: false, follow: false } };
  const title = `${l.title} · ${formatMoney(l.price)}/mo · ${l.semesterLabel}`;
  const description = [`${l.sizeSummary || "Sublet"} in ${l.neighborhood}`, formatMiles(l.distanceMi), `${formatMoney(l.price)} a month${l.priceNegotiable ? ", negotiable" : ""}`, l.semesterLabel]
    .filter(Boolean)
    .join(" · ");
  const image = l.photos[0]?.display;
  return {
    title: `${title} · ${SITE.name}`,
    description,
    alternates: { canonical: `/listing/${l.id}` },
    openGraph: { type: "website", siteName: SITE.name, title, description, url: `${SITE.url}/listing/${l.id}`, ...(image ? { images: [{ url: image }] } : {}) },
    twitter: { card: image ? "summary_large_image" : "summary", title, description, ...(image ? { images: [image] } : {}) },
  };
}

/**
 * One listing. Signed in, any account: the board with that listing's view on
 * top (the old /app/index.php?id=N form, admin notices); /browse decides by
 * the viewer level what that view holds, so a community account gets the
 * public view with Message poster, and a listing kept to students is not on
 * their board at all. Signed out: a
 * page of its own for search engines and shared links, from PublicListing
 * only; a listing that is not on the signed-out board (kept to signed-in
 * students, paused, taken, gone) is a 404, the same for each so the page is
 * not an oracle.
 */
export default async function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if ((await getViewer()).user) {
    const n = Number.parseInt(id, 10);
    redirect(Number.isInteger(n) && n > 0 ? `/browse?id=${n}` : "/browse");
  }
  const l = await publicListing(id);
  if (!l) notFound();
  return (
    <article className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <Link href="/browse" className="link self-start text-sm">
        ← All sublets
      </Link>
      <div className="overflow-hidden rounded-xl border border-line bg-paper">
        <Gallery photos={l.photos} alt={`Photo of ${l.title}`} />
        <div className="p-4 sm:p-6">
          <PublicListingDetails listing={l} headingLevel="h1" />
        </div>
      </div>
      <ViewBeacon listingId={l.id} />
    </article>
  );
}
