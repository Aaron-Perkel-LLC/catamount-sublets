import { Card } from "@/components/admin/Card";
import { type Kpi, KpiRow } from "@/components/admin/KpiCard";
import { PeopleSection } from "@/components/admin/sections/PeopleSection";
import { type Stat, StatList } from "@/components/admin/StatList";
import { TrendChart } from "@/components/admin/TrendChart";
import { CARD, num } from "@/components/admin/ui";
import { getDb } from "@/db";
import { rate } from "@/lib/admin-delta";
import { type AdminSearchParams, param } from "@/lib/admin-page";
import { resolveRange } from "@/lib/admin-range";
import { trendRange, trendSeries } from "@/lib/admin-trend";
import { parsePeopleQuery } from "@/lib/people-search";
import { requireAdminPage } from "@/server/auth";
import { adminPosts } from "@/server/data/admin-listings";
import { accountMetrics } from "@/server/data/admin-metrics";
import { listPeople, searchPeopleIds } from "@/server/services/admin";

const SEEKERS = "var(--color-chart-lake)";
const POSTERS = "var(--color-chart-maple)";

/**
 * Four headline numbers about the accounts as they stand now, new accounts
 * over the range beside the counts that don't need a card each, then
 * everyone with an account (search, ban, Stop email, delete).
 */
export default async function AdminPeople({ searchParams }: { searchParams: AdminSearchParams }) {
  const me = await requireAdminPage("/admin/people");
  const sp = await searchParams;
  const r = resolveRange({ range: param(sp, "range"), from: param(sp, "from"), to: param(sp, "to") });
  const peopleQ = parsePeopleQuery(param(sp, "q"));
  const db = await getDb();
  // The chart's days (src/lib/admin-trend.ts); the other account numbers are as of now, whatever the range.
  const [people, posts, matches, acc] = await Promise.all([listPeople(db), adminPosts(db), peopleQ ? searchPeopleIds(db, peopleQ) : null, accountMetrics(db, trendRange(r))]);
  const postById = new Map(posts.map((p) => [p.id, p]));
  const v = acc.visibility;
  const t = trendSeries(r, acc.weekly, ["posters", "seekers"]);

  const kpis: Kpi[] = [
    { key: "d7", label: "Seen in 7 days", value: num(acc.active.d7), of: `/ ${num(acc.active.total)}`, tip: `Signed in, or used a session, in the last 7 days (sessions refresh at most daily, so to within a day). Of ${num(acc.active.total)} accounts, not counting the admin.` },
    { key: "d30", label: "Seen in 30 days", value: num(acc.active.d30), of: `/ ${num(acc.active.total)}`, tip: `Signed in, or used a session, in the last 30 days. Of ${num(acc.active.total)} accounts, not counting the admin.` },
    { key: "students", label: "Students-only listings", value: num(v.studentsOnly), of: `/ ${num(v.listings)}`, tip: `Listings kept to signed-in students, of all ${num(v.listings)} listings.` },
    { key: "chose", label: "Posters who chose", value: num(v.chose), of: `/ ${num(v.listings)}`, tip: `Posters who set who sees their listing themselves (My post), of all ${num(v.listings)} listings. ${rate(v.choseStudentsOnly, v.chose)} of them chose students only.` },
  ];

  const stat = (label: string, n: number, tip?: string): Stat => ({ label, value: num(n), zero: n === 0, tip });
  const groups = [
    {
      title: "Accounts",
      stats: [
        stat("People", people.length, "Everyone with an account, the admin included."),
        stat("Migrated", people.filter((p) => p.legacyNetid).length, "Carried over from the old site. Not in the New accounts chart."),
        stat("Banned", people.filter((p) => p.banned).length),
        stat("No email", people.filter((p) => p.noEmail).length, "Get no announcement emails (Stop email, under ⋯)."),
      ],
    },
    {
      title: "Posts",
      stats: [stat("Posts", posts.length), stat("Hidden", posts.filter((p) => p.hidden).length), stat("Taken", posts.filter((p) => p.status === "taken").length)],
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <KpiRow kpis={kpis} />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <Card
          title="New accounts"
          tip={`${t.mode === "rolling" ? "Each point is the total for the 7 days ending that day" : "By Eastern day"}, not counting migrated accounts or the admin. Posters have a listing now; seekers don't (someone who deleted theirs counts as a seeker).`}
          actions={
            <span className="flex items-center gap-3 text-xs text-ink-3">
              <Key color={SEEKERS}>Seekers</Key>
              <Key color={POSTERS}>Posters</Key>
              <span className="border-l border-line-light pl-3 max-sm:hidden">{t.mode === "rolling" ? "7-day totals" : "By day"}</span>
            </span>
          }
        >
          <div className="-mb-3">
            <TrendChart
              label="New accounts"
              points={t.points}
              series={[
                { key: "seekers", label: "seekers", color: SEEKERS, kind: "area", values: t.values.seekers },
                { key: "posters", label: "posters", color: POSTERS, kind: "line", values: t.values.posters },
              ]}
            />
          </div>
        </Card>

        <section className={`${CARD} py-2`} aria-label="Accounts and posts">
          <StatList groups={groups} />
        </section>
      </div>

      <Card flush title="People" tip="Everyone with an account. A post number opens that listing with the admin's controls; ⋯ bans, stops announcement email or deletes.">
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
      </Card>
    </div>
  );
}

/** One series in the chart's legend: a short stroke of its colour and its name. */
function Key({ color, children }: { color: string; children: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-0.5 w-3 rounded-full" style={{ background: color }} aria-hidden />
      {children}
    </span>
  );
}
