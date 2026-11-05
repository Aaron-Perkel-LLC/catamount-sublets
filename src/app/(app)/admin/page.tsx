import type { Metadata } from "next";
import { SITE } from "@/config/site";
import { getDb } from "@/db";
import { listings, listingPhotos, semesters, user } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { formatAddress } from "@/lib/format";
import { sortSemesters } from "@/lib/semesters";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth";
import { ACTIVITY_RANGES, type ActivityRange, dailyActivity, listingActivity, shareTargetCounts, viewSourceCounts } from "@/server/data/events";
import { labelFor, listingSemestersByListing } from "@/server/data/semesters";
import { posterColumns, shownName } from "@/server/data/names";
import { getSetting } from "@/server/data/settings";
import { listSurveyText, surveyAudience, surveySummary } from "@/server/data/survey";
import { approvedEmails, listPendingAccessRequests } from "@/server/data/access-requests";
import { visibleSemesterWhere } from "@/server/data/visibility";
import { adminStats, archiveHistory, listPeople } from "@/server/services/admin";
import { listingCountForSemester } from "@/server/data/semesters";
import { AdminTabs } from "@/components/admin/AdminTabs";

export const metadata: Metadata = { title: `Admin · ${SITE.name}` };
/** The email form's action runs here and paces itself under a second per person; this covers several hundred. */
export const maxDuration = 800;

/** Everything the admin tabs need, loaded once; the tabs are client components over it. */
export default async function AdminPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const me = await requireUser("/admin");
  if (me.role !== "admin") redirect("/browse");
  const { range: rangeRaw } = await searchParams;
  const range: ActivityRange = (ACTIVITY_RANGES as string[]).includes(rangeRaw ?? "") ? (rangeRaw as ActivityRange) : "open";
  const db = await getDb();

  const semesterRows = sortSemesters(await db.select().from(semesters));
  const semestersWithCounts = await Promise.all(semesterRows.map(async (s) => ({ ...s, postCount: await listingCountForSemester(db, s.code) })));

  const postRows = await db
    .select({
      id: listings.id,
      ownerId: user.id,
      ownerEmail: user.email,
      poster: posterColumns,
      displayName: listings.displayName,
      address: listings.address,
      price: listings.price,
      status: listings.status,
      hidden: sql<boolean>`not (${visibleSemesterWhere()})`,
      photos: sql<number>`(select count(*) from ${listingPhotos} p where p.listing_id = ${listings.id})::int`,
    })
    .from(listings)
    .innerJoin(user, eq(user.id, listings.userId))
    .orderBy(desc(listings.id));
  const sems = await listingSemestersByListing(db, postRows.map((p) => p.id));
  const posts = postRows.map(({ poster, displayName, ...p }) => ({ ...p, ownerName: shownName({ displayName }, poster, p.ownerEmail), shortAddress: formatAddress(p.address), semesterLabel: labelFor(sems.get(p.id) ?? [], false).label }));

  const postById = new Map(posts.map((p) => [p.id, p]));

  const [stats, archives, announcement, readOnly, people, activity, daily, targets, sources, pendingRequests, approved, survey, surveyText, invited] = await Promise.all([
    adminStats(db),
    archiveHistory(db),
    getSetting(db, "announcement"),
    getSetting(db, "read_only"),
    listPeople(db),
    listingActivity(db, range),
    dailyActivity(db, range === "30d" ? 30 : 60),
    shareTargetCounts(db, range),
    viewSourceCounts(db, range),
    listPendingAccessRequests(db),
    approvedEmails(db),
    surveySummary(db),
    listSurveyText(db),
    surveyAudience(db),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Admin</h1>
      <AdminTabs
        me={{ id: me.id }}
        viewer={{ signature: me.name && me.name !== me.email.split("@")[0] ? me.name : null, isAdmin: true }}
        stats={stats}
        semesters={semestersWithCounts.map((s) => ({ code: s.code, name: s.name, active: s.active, archivedAt: s.archivedAt?.toISOString() ?? null, postCount: s.postCount }))}
        archives={archives.map((a) => ({ ...a, archivedAt: a.archivedAt.toISOString() }))}
        announcement={announcement}
        readOnly={readOnly}
        requests={{ pending: pendingRequests.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })), approved }}
        people={people.map(({ listingId, ...p }) => {
          const post = listingId ? postById.get(listingId) : undefined;
          return {
            ...p,
            lastLoginAt: p.lastLoginAt?.toISOString() ?? null,
            createdAt: p.createdAt.toISOString(),
            post: post ? { id: post.id, shortAddress: post.shortAddress, price: post.price, status: post.status, hidden: post.hidden, photos: post.photos, semesterLabel: post.semesterLabel } : null,
          };
        })}
        survey={{ invited: invited.length, summary: survey, text: surveyText.map((t) => ({ ...t, answeredAt: t.answeredAt.toISOString() })) }}
        activity={{
          range,
          daily,
          sources,
          targets,
          perListing: posts.map((p) => ({ id: p.id, shortAddress: p.shortAddress, ownerId: p.ownerId, ownerEmail: p.ownerEmail, ownerName: p.ownerName, status: p.status, hidden: p.hidden, ...(activity.get(p.id) ?? { views: 0, contacts: 0, converted: 0, shares: 0, arrivals: 0 }) })),
        }}
      />
    </div>
  );
}
