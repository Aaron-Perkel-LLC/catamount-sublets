import { LineChart } from "@/components/admin/LineChart";
import { Panel } from "@/components/admin/Panel";
import { RangePicker } from "@/components/admin/RangePicker";
import { PeopleSection } from "@/components/admin/sections/PeopleSection";
import { StatTile } from "@/components/admin/StatTile";
import { getDb } from "@/db";
import { rate } from "@/lib/admin-delta";
import { type AdminSearchParams, param, rangeDto } from "@/lib/admin-page";
import { resolveRange } from "@/lib/admin-range";
import { parsePeopleQuery } from "@/lib/people-search";
import { requireAdminPage } from "@/server/auth";
import { adminPosts } from "@/server/data/admin-listings";
import { accountMetrics } from "@/server/data/admin-metrics";
import { listPeople, searchPeopleIds } from "@/server/services/admin";

/** Accounts over the range, then everyone with an account (search, ban, Stop email, delete). */
export default async function AdminPeople({ searchParams }: { searchParams: AdminSearchParams }) {
  const me = await requireAdminPage("/admin/people");
  const sp = await searchParams;
  const r = resolveRange({ range: param(sp, "range"), from: param(sp, "from"), to: param(sp, "to") });
  const peopleQ = parsePeopleQuery(param(sp, "q"));
  const db = await getDb();
  const [people, posts, matches, acc] = await Promise.all([listPeople(db), adminPosts(db), peopleQ ? searchPeopleIds(db, peopleQ) : null, accountMetrics(db, r)]);
  const postById = new Map(posts.map((p) => [p.id, p]));
  const v = acc.visibility;

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-ink-3">
        {people.length} {people.length === 1 ? "person" : "people"} · {posts.length} post{posts.length === 1 ? "" : "s"} · {posts.filter((p) => p.hidden).length} hidden · {posts.filter((p) => p.status === "taken").length} taken
      </p>
      <RangePicker range={rangeDto(r)} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="Seen in 7 days" value={acc.active.d7} sub={`of ${acc.active.total} accounts`} title="Signed in, or used a session, in the last 7 days (sessions refresh at most daily, so to within a day)" />
        <StatTile label="Seen in 30 days" value={acc.active.d30} sub={`of ${acc.active.total} accounts`} />
        <StatTile label="Listings students only" value={v.studentsOnly} sub={`of ${v.listings} listings`} />
        <StatTile label="Posters who chose" value={v.chose} sub={`${rate(v.choseStudentsOnly, v.chose)} chose students only`} title="Posters who set who sees their listing themselves (My post)" />
      </div>
      <Panel title="New accounts" hint={`Per ${r.bucket === "day" ? "Eastern day" : "week"}, not counting migrated accounts or the admin. Posters have a listing now; seekers don't (someone who deleted theirs counts as a seeker).`}>
        <LineChart
          label="New accounts"
          bucket={r.bucket}
          series={[
            { key: "posters", label: "Posters", color: "var(--color-chart-maple)" },
            { key: "seekers", label: "Seekers", color: "var(--color-chart-lake)" },
          ]}
          points={acc.weekly.map((w) => ({ day: w.day, values: { posters: w.posters, seekers: w.seekers } }))}
        />
      </Panel>
      <PeopleSection
        meId={me.id}
        initialSearch={{ q: peopleQ, ids: matches }}
        people={people.map(({ listingId, ...p }) => {
          const post = listingId ? postById.get(listingId) : undefined;
          return {
            ...p,
            lastLoginAt: p.lastLoginAt?.toISOString() ?? null,
            createdAt: p.createdAt.toISOString(),
            post: post ? { id: post.id, shortAddress: post.shortAddress, price: post.price, status: post.status, hidden: post.hidden, photos: post.photos, semesterLabel: post.semesterLabel } : null,
          };
        })}
      />
    </div>
  );
}
