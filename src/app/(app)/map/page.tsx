import type { Metadata } from "next";
import { SITE } from "@/config/site";
import { getDb } from "@/db";
import { FilterBar } from "@/components/filters/FilterBar";
import { ListingViewProvider } from "@/components/listings/listing-view";
import { MapViewLoader } from "@/components/map/MapViewLoader";
import { parseListingQuery, type SearchParams } from "@/lib/listing-filters";
import { requireUser } from "@/server/auth";
import { browseListings, filterBounds } from "@/server/data/listings";
import { boardSemesters, emptyActiveSemesters } from "@/server/data/semesters";

export const metadata: Metadata = { title: `Map · ${SITE.name}` };

/** The same filtered listings as Browse, on a map. Sort does not apply. */
export default async function MapPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser("/map");
  const query = { ...parseListingQuery(await searchParams), id: undefined, via: undefined };
  const db = await getDb();
  const [result, bounds, semesters, empty] = await Promise.all([
    browseListings(db, query, user.id),
    filterBounds(db),
    boardSemesters(db),
    emptyActiveSemesters(db),
  ]);
  const viewer = {
    signature: user.name && user.name !== user.email.split("@")[0] ? user.name : null,
    isAdmin: user.role === "admin",
  };
  return (
    <ListingViewProvider viewer={viewer}>
      <div className="flex flex-col gap-4">
        <FilterBar
          mode="map"
          query={query}
          bounds={bounds}
          semesters={semesters}
          emptySemesters={empty}
          count={result.filterCount}
          resultCount={result.listings.length}
        />
        <h1 className="sr-only">Map of {result.listings.length} sublets</h1>
        <MapViewLoader listings={result.listings} />
      </div>
    </ListingViewProvider>
  );
}
