import type { Metadata } from "next";
import { AllSignedInOnly, SignedInOnlyNote } from "@/components/listings/SignedInOnlyNote";
import { ACCESS, DIGEST, SITE } from "@/config/site";
import { getDb } from "@/db";
import { FilterBar } from "@/components/filters/FilterBar";
import { SaveSearchButton } from "@/components/filters/SaveSearchButton";
import { SortBar } from "@/components/filters/SortBar";
import { ListingsGrid } from "@/components/listings/ListingsGrid";
import { ListingViewProvider } from "@/components/listings/listing-view";
import { canonicalFilterQuery, defaultSearchName, filterSearchParams, parseListingQuery, type SearchParams, withQuery } from "@/lib/listing-filters";
import type { SessionUser } from "@/server/auth";
import { anyListingExists, browseListings, filterBounds } from "@/server/data/listings";
import { getNames } from "@/server/data/names";
import { publicBoardCount, publicBoardListings, signedInOnlyCount } from "@/server/data/public-listings";
import { boardSemesters, emptyActiveSemesters } from "@/server/data/semesters";
import { digestSubscriptionFor, savedSearchesFor } from "@/server/data/digest";
import { getViewer, type Viewer } from "@/server/viewer";
import { seesFullListings } from "@/lib/viewer";

/** Signed in (any account): a plain title. Signed out: a page for search engines. */
export async function generateMetadata(): Promise<Metadata> {
  if ((await getViewer()).user) return { title: `Browse · ${SITE.name}` };
  return {
    title: `Browse sublets · ${SITE.name}`,
    description: `Sublets near campus by price, semester and distance, from verified ${ACCESS.audience}. Addresses and contact details are for ${ACCESS.audience}.`,
    alternates: { canonical: "/browse" },
  };
}

/**
 * The board. Filters live in the query string; a change re-renders this page
 * (FilterBar replaces the URL). `?id=` is a share link coming back from
 * sign-in: every filter is dropped so a stale price or semester in the URL
 * cannot hide the card the link was sent to open.
 *
 * What it shows is the viewer level's call (getViewer()): students and the
 * admin get the full board; signed-out visitors and community accounts get
 * the public one (PublicListing only, CLAUDE.md rule 9).
 */
export default async function BrowsePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const viewer = await getViewer();
  const params = await searchParams;
  const raw = parseListingQuery(params);
  const query = raw.id ? { ...parseListingQuery({}), sort: raw.sort, id: raw.id, via: raw.via } : raw;
  if (!viewer.user || !seesFullListings(viewer.level)) return <PublicBrowse query={{ ...query, openTo: undefined }} viewer={viewer} />;
  const user = viewer.user;

  const db = await getDb();
  const [result, bounds, semesters, empty, anyExists, saved, digest] = await Promise.all([
    browseListings(db, query, user.id),
    filterBounds(db, "full"),
    boardSemesters(db, "full"),
    emptyActiveSemesters(db, "full"),
    anyListingExists(db),
    savedSearchesFor(db, user.id),
    digestSubscriptionFor(db, user.id),
  ]);

  const view = {
    signature: user.name && user.name !== user.email.split("@")[0] ? user.name : null,
    isAdmin: user.role === "admin",
  };
  const semesterName = query.semester ? semesters.find((s) => s.code === query.semester)?.name : undefined;

  return (
    <ListingViewProvider viewer={view}>
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
        <SortBar count={result.listings.length} semesterName={semesterName} filtered={result.filterCount > 0} sort={query.sort}>
          <SaveSearch query={query} semesterName={semesterName} saved={saved} digestOn={digest.enabled} />
        </SortBar>
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

/** "Get alerts for this search": saves Browse's own query string, the filter half only. Any account, student or community. */
function SaveSearch({
  query,
  semesterName,
  saved,
  digestOn,
}: {
  query: ReturnType<typeof parseListingQuery>;
  semesterName: string | undefined;
  saved: { query: string }[];
  digestOn: boolean;
}) {
  const filterQuery = filterSearchParams(query).toString();
  const canonical = canonicalFilterQuery(filterQuery);
  return (
    <SaveSearchButton
      query={filterQuery}
      suggestedName={defaultSearchName(query, semesterName, DIGEST.savedSearchNameMaxChars)}
      digestOn={digestOn}
      savedCount={saved.length}
      alreadySaved={saved.some((s) => s.query === canonical)}
    />
  );
}

/** A community account's saved searches, digest switch and name for Message poster; null signed out. */
async function communityExtras(user: SessionUser | null) {
  if (!user) return null;
  const db = await getDb();
  const [saved, digest, names] = await Promise.all([savedSearchesFor(db, user.id), digestSubscriptionFor(db, user.id), getNames(db, user.id)]);
  return { saved, digest, relay: { name: [names.first, names.last].filter(Boolean).join(" "), email: user.email } };
}

/**
 * The public board, for a signed-out visitor or a community account:
 * PublicListing only (CLAUDE.md rule 9), the same filters bar without
 * roommate preferences, and the count of listings kept to students. A
 * community account also gets saved searches and Message poster.
 */
async function PublicBrowse({ query, viewer }: { query: ReturnType<typeof parseListingQuery>; viewer: Viewer }) {
  const db = await getDb();
  const [result, bounds, semesters, empty, anyExists, hidden, publicCount, extras] = await Promise.all([
    publicBoardListings(db, query),
    filterBounds(db, "public"),
    boardSemesters(db, "public"),
    emptyActiveSemesters(db, "public"),
    anyListingExists(db),
    signedInOnlyCount(db),
    publicBoardCount(db),
    communityExtras(viewer.user),
  ]);
  const community = extras !== null;
  const next = withQuery("/browse", filterSearchParams(query));
  // Nothing public at all, but some kept to students: one message, not "N more" beside "No listings up right now".
  const allHidden = publicCount === 0 && hidden > 0;
  const semesterName = query.semester ? semesters.find((s) => s.code === query.semester)?.name : undefined;
  return (
    <ListingViewProvider viewer={null} relay={extras?.relay ?? null}>
      <div className="flex flex-col gap-4">
        <FilterBar
          mode="browse"
          query={query}
          bounds={bounds}
          semesters={semesters}
          emptySemesters={empty}
          count={result.filterCount}
          resultCount={result.listings.length}
          signedOut
        />
        <SortBar count={result.listings.length} semesterName={semesterName} filtered={result.filterCount > 0} sort={query.sort}>
          {extras && <SaveSearch query={query} semesterName={semesterName} saved={extras.saved} digestOn={extras.digest.enabled} />}
        </SortBar>
        {!allHidden && <SignedInOnlyNote count={hidden} next={next} community={community} />}
        <ListingsGrid
          listings={result.listings}
          openId={query.id}
          openSource={query.via === "share" ? "share-link" : "deeplink"}
          anyExists={anyExists}
          filtered={result.filterCount > 0}
          signedOut
          community={community}
          emptyState={allHidden ? <AllSignedInOnly count={hidden} next={next} community={community} /> : undefined}
        />
      </div>
    </ListingViewProvider>
  );
}
