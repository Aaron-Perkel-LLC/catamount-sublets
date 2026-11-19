import { CsvButton } from "@/components/admin/CsvButton";
import { ListingsTable } from "@/components/admin/ListingsTable";
import { OutcomesCard } from "@/components/admin/OutcomesCard";
import { Panel, ScrollTable } from "@/components/admin/Panel";
import { RangePicker } from "@/components/admin/RangePicker";
import { getDb } from "@/db";
import { semesters } from "@/db/schema";
import { type AdminSearchParams, param, rangeDto } from "@/lib/admin-page";
import { resolveRange } from "@/lib/admin-range";
import { sortSemesters } from "@/lib/semesters";
import { requireAdminPage } from "@/server/auth";
import { adminPosts, listingRows } from "@/server/data/admin-listings";
import { demandBySemester, listingNumbers } from "@/server/data/admin-metrics";
import { outcomeSummary } from "@/server/data/listing-outcomes";

/** Every listing with its numbers in the range, supply against demand per semester, and how listings ended. */
export default async function AdminListings({ searchParams }: { searchParams: AdminSearchParams }) {
  await requireAdminPage("/admin/listings");
  const sp = await searchParams;
  const r = resolveRange({ range: param(sp, "range"), from: param(sp, "from"), to: param(sp, "to") });
  const db = await getDb();
  const [posts, numbers, demand, outcomes, sems] = await Promise.all([adminPosts(db), listingNumbers(db, r), demandBySemester(db, r), outcomeSummary(db), db.select().from(semesters)]);
  const rows = listingRows(posts, numbers);

  // Per active semester, by each listing's first semester (what its events are tagged with).
  const supply = sortSemesters(sems.filter((s) => s.active)).map((s) => {
    const onBoard = posts.filter((p) => p.onBoard && p.firstSemester === s.code).length;
    const d = demand.find((x) => x.code === s.code) ?? { views: 0, contacts: 0, listingsContacted: 0 };
    return {
      code: s.code,
      name: s.name,
      onBoard,
      views: d.views,
      contacts: d.contacts,
      viewsPer: onBoard ? Math.round((d.views / onBoard) * 10) / 10 : null,
      contactsPer: onBoard ? Math.round((d.contacts / onBoard) * 10) / 10 : null,
      contacted: d.listingsContacted,
    };
  });

  return (
    <div className="flex flex-col gap-5">
      <RangePicker range={rangeDto(r)} />
      <Panel title="Listings" hint="Views are people-days in the range; contacts, people who got in touch. A deleted listing with activity in the range shows as Deleted #id.">
        <ListingsTable rows={rows} initialAttention={param(sp, "view") === "attention"} />
      </Panel>

      <Panel
        title="Supply and demand"
        hint="Per semester students can post for, by each listing's first semester: listings on the board now against views and contacts in the range."
        actions={
          <CsvButton
            name="supply-demand"
            columns={[
              { key: "name", label: "semester" },
              { key: "onBoard", label: "on_board" },
              { key: "views", label: "views" },
              { key: "contacts", label: "contacts" },
              { key: "viewsPer", label: "views_per_listing" },
              { key: "contactsPer", label: "contacts_per_listing" },
              { key: "contacted", label: "listings_contacted" },
            ]}
            rows={supply}
          />
        }
      >
        {supply.length === 0 ? (
          <p className="text-sm text-ink-3">No active semesters.</p>
        ) : (
          <ScrollTable>
            <table className="w-full min-w-[32rem] text-sm">
              <thead className="text-left text-xs text-ink-3">
                <tr>
                  <th className="py-1 pr-3 font-normal">Semester</th>
                  <th className="pr-3 font-normal">On the board</th>
                  <th className="pr-3 font-normal">Views</th>
                  <th className="pr-3 font-normal">Per listing</th>
                  <th className="pr-3 font-normal">Contacts</th>
                  <th className="pr-3 font-normal">Per listing</th>
                  <th className="font-normal">Listings contacted</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {supply.map((s) => (
                  <tr key={s.code} className="border-t border-line-light">
                    <td className="py-1.5 pr-3">{s.name}</td>
                    <td className="pr-3">{s.onBoard}</td>
                    <td className="pr-3">{s.views}</td>
                    <td className="pr-3">{s.viewsPer ?? "—"}</td>
                    <td className="pr-3">{s.contacts}</td>
                    <td className="pr-3">{s.contactsPer ?? "—"}</td>
                    <td>{s.contacted}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollTable>
        )}
      </Panel>

      <OutcomesCard outcomes={outcomes} />
    </div>
  );
}
