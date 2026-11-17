import type { Metadata } from "next";
import { SITE } from "@/config/site";
import { getDb } from "@/db";
import { FilterBar } from "@/components/filters/FilterBar";
import { ListingViewProvider } from "@/components/listings/listing-view";
import { MapViewLoader } from "@/components/map/MapViewLoader";
import { SignedInOnlyNote } from "@/components/listings/SignedInOnlyNote";
import { filterSearchParams, parseListingQuery, type SearchParams, withQuery } from "@/lib/listing-filters";
import { getSessionUser } from "@/server/auth";
import { browseListings, filterBounds } from "@/server/data/listings";
import { publicBoardListings, signedInOnlyCount } from "@/server/data/public-listings";
import { boardSemesters, emptyActiveSemesters } from "@/server/data/semesters";

/** Signed in: as before. Signed out: a page for search engines. */
export async function generateMetadata(): Promise<Metadata> {
  if (await getSessionUser()) return { title: `Map · ${SITE.name}` };
  return {
    title: `Map of sublets · ${SITE.name}`,
    description: "Sublets near campus on a map, each shown as its approximate area. Exact addresses are for signed-in students.",
    alternates: { canonical: "/map" },
  };
}

/** The same filtered listings as Browse, on a map. Sort does not apply. */
export default async function MapPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await getSessionUser();
  const query = { ...parseListingQuery(await searchParams), id: undefined, via: undefined };
  if (!user) return <SignedOutMap query={{ ...query, openTo: undefined }} />;
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

/** The signed-out map: PublicListing only, each drawn as its approximate area (MapView), never a pin. */
async function SignedOutMap({ query }: { query: ReturnType<typeof parseListingQuery> }) {
  const db = await getDb();
  const [result, bounds, semesters, empty, hidden] = await Promise.all([
    publicBoardListings(db, query),
    filterBounds(db, "signed-out"),
    boardSemesters(db, "signed-out"),
    emptyActiveSemesters(db, "signed-out"),
    signedInOnlyCount(db),
  ]);
  return (
    <ListingViewProvider viewer={null}>
      <div className="flex flex-col gap-4">
        <FilterBar
          mode="map"
          query={query}
          bounds={bounds}
          semesters={semesters}
          emptySemesters={empty}
          count={result.filterCount}
          resultCount={result.listings.length}
          signedOut
        />
        <SignedInOnlyNote count={hidden} next={withQuery("/map", filterSearchParams(query))} />
        <h1 className="sr-only">Map of {result.listings.length} sublets</h1>
        <MapViewLoader listings={result.listings} />
      </div>
    </ListingViewProvider>
  );
}
