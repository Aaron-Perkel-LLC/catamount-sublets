import type { Metadata } from "next";
import { ACCESS, SITE } from "@/config/site";
import { getDb } from "@/db";
import { FilterBar } from "@/components/filters/FilterBar";
import { ListingViewProvider } from "@/components/listings/listing-view";
import { MapViewLoader } from "@/components/map/MapViewLoader";
import { AllSignedInOnly, SignedInOnlyNote } from "@/components/listings/SignedInOnlyNote";
import { filterSearchParams, parseListingQuery, type SearchParams, withQuery } from "@/lib/listing-filters";
import { seesFullListings } from "@/lib/viewer";
import { getNames } from "@/server/data/names";
import { getViewer, type Viewer } from "@/server/viewer";
import { browseListings, filterBounds } from "@/server/data/listings";
import { publicBoardCount, publicBoardListings, signedInOnlyCount } from "@/server/data/public-listings";
import { boardSemesters, emptyActiveSemesters } from "@/server/data/semesters";

/** Signed in (any account): a plain title. Signed out: a page for search engines. */
export async function generateMetadata(): Promise<Metadata> {
  if ((await getViewer()).user) return { title: `Map · ${SITE.name}` };
  return {
    title: `Map of sublets · ${SITE.name}`,
    description: `Sublets near campus on a map, each shown as its approximate area. Exact addresses are for ${ACCESS.audience}.`,
    alternates: { canonical: "/map" },
  };
}

/** The same filtered listings as Browse, on a map. Sort does not apply. Full pins for students and the admin; areas for everyone else (getViewer()). */
export default async function MapPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const viewer = await getViewer();
  const query = { ...parseListingQuery(await searchParams), id: undefined, via: undefined };
  if (!viewer.user || !seesFullListings(viewer.level)) return <PublicMap query={{ ...query, openTo: undefined }} viewer={viewer} />;
  const user = viewer.user;
  const db = await getDb();
  const [result, bounds, semesters, empty] = await Promise.all([
    browseListings(db, query, user.id),
    filterBounds(db, "full"),
    boardSemesters(db, "full"),
    emptyActiveSemesters(db, "full"),
  ]);
  const view = {
    signature: user.name && user.name !== user.email.split("@")[0] ? user.name : null,
    isAdmin: user.role === "admin",
  };
  return (
    <ListingViewProvider viewer={view}>
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

/** The public map (signed out, or a community account): PublicListing only, each drawn as its approximate area (MapView), never a pin. */
async function PublicMap({ query, viewer }: { query: ReturnType<typeof parseListingQuery>; viewer: Viewer }) {
  const db = await getDb();
  const [result, bounds, semesters, empty, hidden, publicCount, names] = await Promise.all([
    publicBoardListings(db, query),
    filterBounds(db, "public"),
    boardSemesters(db, "public"),
    emptyActiveSemesters(db, "public"),
    signedInOnlyCount(db),
    publicBoardCount(db),
    viewer.user ? getNames(db, viewer.user.id) : null,
  ]);
  const community = viewer.user !== null;
  const relay = viewer.user && names ? { name: [names.first, names.last].filter(Boolean).join(" "), email: viewer.user.email } : null;
  const next = withQuery("/map", filterSearchParams(query));
  const allHidden = publicCount === 0 && hidden > 0;
  return (
    <ListingViewProvider viewer={null} relay={relay}>
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
        {allHidden ? <AllSignedInOnly count={hidden} next={next} community={community} /> : <SignedInOnlyNote count={hidden} next={next} community={community} />}
        <h1 className="sr-only">Map of {result.listings.length} sublets</h1>
        <MapViewLoader listings={result.listings} />
      </div>
    </ListingViewProvider>
  );
}
