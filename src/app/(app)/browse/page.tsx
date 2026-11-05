import type { Metadata } from "next";
import { SITE } from "@/config/site";
import { getDb } from "@/db";
import { FilterBar } from "@/components/filters/FilterBar";
import { SortBar } from "@/components/filters/SortBar";
import { ListingsGrid } from "@/components/listings/ListingsGrid";
import { ListingViewProvider } from "@/components/listings/listing-view";
import { parseListingQuery, type SearchParams } from "@/lib/listing-filters";
import { requireUser } from "@/server/auth";
import { anyListingExists, browseListings, filterBounds } from "@/server/data/listings";
import { boardSemesters, emptyActiveSemesters } from "@/server/data/semesters";

export const metadata: Metadata = { title: `Browse · ${SITE.name}` };

/**
 * The board. Filters live in the query string; a change re-renders this page
 * (FilterBar replaces the URL). `?id=` is a share link coming back from
 * sign-in: every filter is dropped so a stale price or semester in the URL
 * cannot hide the card the link was sent to open.
 */
export default async function BrowsePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser("/browse");
  const params = await searchParams;
  const raw = parseListingQuery(params);
  const query = raw.id ? { ...parseListingQuery({}), sort: raw.sort, id: raw.id, via: raw.via } : raw;

  const db = await getDb();
  const [result, bounds, semesters, empty, anyExists] = await Promise.all([
    browseListings(db, query, user.id),
    filterBounds(db),
    boardSemesters(db),
    emptyActiveSemesters(db),
    anyListingExists(db),
  ]);

  const viewer = {
    signature: user.name && user.name !== user.email.split("@")[0] ? user.name : null,
    isAdmin: user.role === "admin",
  };
  const semesterName = query.semester ? semesters.find((s) => s.code === query.semester)?.name : undefined;

  return (
    <ListingViewProvider viewer={viewer}>
      <div className="flex flex-col gap-4">
        <FilterBar
          mode="browse"
          query={query}
          bounds={bounds}
          semesters={semesters}
          emptySemesters={empty}
          count={result.filterCount}
          resultCount={result.listings.length}
        />
        <SortBar count={result.listings.length} semesterName={semesterName} filtered={result.filterCount > 0} sort={query.sort} />
        <ListingsGrid
          listings={result.listings}
          openId={query.id}
          openSource={query.via === "share" ? "share-link" : "deeplink"}
          anyExists={anyExists}
          filtered={result.filterCount > 0}
        />
      </div>
    </ListingViewProvider>
  );
}
