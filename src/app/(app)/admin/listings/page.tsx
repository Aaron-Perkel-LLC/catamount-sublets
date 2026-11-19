import { Card } from "@/components/admin/Card";
import { CsvButton } from "@/components/admin/CsvButton";
import { DataTable, Num } from "@/components/admin/DataTable";
import { ListingsTable } from "@/components/admin/ListingsTable";
import { OutcomesCard } from "@/components/admin/OutcomesCard";
import { getDb } from "@/db";
import { semesters } from "@/db/schema";
import { type AdminSearchParams, param } from "@/lib/admin-page";
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
    <div className="flex flex-col gap-4">
      <Card flush title="Listings" tip="Views are people-days in the range; contacts, people who got in touch; rate, contacts over views. A deleted listing with activity in the range stays in the table, muted.">
        <ListingsTable rows={rows} initialAttention={param(sp, "view") === "attention"} />
      </Card>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card
          flush
          title="Supply and demand"
          tip="Per semester students can post for, by each listing's first semester: listings on the board now against views and contacts in the range."
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
          <DataTable
            label="Supply and demand by semester"
            rows={supply}
            rowKey={(s) => s.code}
            empty="No active semesters."
            columns={[
              { key: "name", header: "Semester", primary: true, cell: (s) => <span className="font-bold">{s.name}</span> },
              { key: "onBoard", header: "On the board", numeric: true, cell: (s) => <Num n={s.onBoard} /> },
              { key: "views", header: "Views", numeric: true, cell: (s) => <Num n={s.views} /> },
              { key: "viewsPer", header: "Per listing", numeric: true, cell: (s) => s.viewsPer ?? "—" },
              { key: "contacts", header: "Contacts", numeric: true, cell: (s) => <Num n={s.contacts} /> },
              { key: "contactsPer", header: "Per listing", numeric: true, cell: (s) => s.contactsPer ?? "—" },
              { key: "contacted", header: "Listings contacted", numeric: true, cell: (s) => <Num n={s.contacted} /> },
            ]}
          />
        </Card>

        <OutcomesCard outcomes={outcomes} />
      </div>
    </div>
  );
}
