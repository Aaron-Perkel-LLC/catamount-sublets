import { AnnounceTab } from "@/components/admin/AnnounceTab";
import { Card } from "@/components/admin/Card";
import { CsvButton } from "@/components/admin/CsvButton";
import { DataTable, Num } from "@/components/admin/DataTable";
import { Pill } from "@/components/admin/Pill";
import { getDb } from "@/db";
import { type AdminSearchParams, param } from "@/lib/admin-page";
import { resolveRange } from "@/lib/admin-range";
import { requireAdminPage } from "@/server/auth";
import { semesterRows } from "@/server/data/admin-semesters";
import { noticeNumbers } from "@/server/data/admin-metrics";
import { listNoticesForAdmin } from "@/server/data/notices";
import { getSetting } from "@/server/data/settings";
import { listPeople } from "@/server/services/admin";

/** A count with its share of the popup's views beside it; the share keeps its width when there is none, so the counts line up. */
function WithRate({ n, rate }: { n: number; rate: number | null }) {
  return (
    <span className="whitespace-nowrap">
      <Num n={n} />
      <span className="ml-1.5 inline-block w-8 text-[11px] text-ink-3">{rate === null ? "" : `${rate}%`}</span>
    </span>
  );
}

/**
 * How the popups did in the range (the only thing here the header's date
 * range applies to, so it comes first and says so), then the banner, the
 * popups and the broadcast email.
 */
export default async function AdminAnnounce({ searchParams }: { searchParams: AdminSearchParams }) {
  await requireAdminPage("/admin/announce");
  const sp = await searchParams;
  const r = resolveRange({ range: param(sp, "range"), from: param(sp, "from"), to: param(sp, "to") });
  const db = await getDb();
  const [announcement, notices, rows, people, numbers] = await Promise.all([getSetting(db, "announcement"), listNoticesForAdmin(db), semesterRows(db), listPeople(db), noticeNumbers(db, r)]);
  const popupRows = numbers.map((n) => ({ ...n, ctaRate: n.views ? Math.round((n.ctas / n.views) * 100) : null, dismissRate: n.views ? Math.round((n.dismissals / n.views) * 100) : null }));

  return (
    <div className="flex flex-col gap-4">
      <Card
        flush
        title="Popups in this range"
        tip="First views, dismissals and button clicks recorded in the range; each person counts once per popup (a signed-out visitor once a day). The percentages are shares of those shown it."
        actions={
          <CsvButton
            name="popups"
            columns={[
              { key: "id", label: "id" },
              { key: "title", label: "title" },
              { key: "active", label: "live" },
              { key: "views", label: "shown" },
              { key: "dismissals", label: "dismissed" },
              { key: "ctas", label: "button_clicks" },
            ]}
            rows={popupRows}
          />
        }
      >
        <DataTable
          label="Popups in this range"
          rows={popupRows}
          rowKey={(n) => n.id}
          empty="No popups yet."
          columns={[
            {
              key: "title",
              header: "Popup",
              primary: true,
              cell: (n) => (
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-bold">{n.title}</span>
                  {n.active && <Pill tone="good">Live</Pill>}
                </span>
              ),
            },
            { key: "views", header: "Shown", numeric: true, cell: (n) => <Num n={n.views} /> },
            { key: "dismissals", header: "Dismissed", numeric: true, cell: (n) => <WithRate n={n.dismissals} rate={n.dismissRate} /> },
            { key: "ctas", header: "Button", numeric: true, cell: (n) => <WithRate n={n.ctas} rate={n.ctaRate} /> },
          ]}
        />
      </Card>

      <AnnounceTab
        announcement={announcement}
        semesters={rows}
        notices={notices}
        people={people.map((p) => ({ id: p.id, email: p.email, name: p.name, role: p.role, banned: p.banned, banReason: p.banReason, noEmail: p.noEmail, legacyNetid: p.legacyNetid, lastLoginAt: p.lastLoginAt?.toISOString() ?? null, createdAt: p.createdAt.toISOString(), post: null }))}
      />
    </div>
  );
}
