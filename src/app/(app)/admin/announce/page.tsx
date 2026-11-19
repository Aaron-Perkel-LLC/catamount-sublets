import { AnnounceTab } from "@/components/admin/AnnounceTab";
import { CsvButton } from "@/components/admin/CsvButton";
import { Panel, ScrollTable } from "@/components/admin/Panel";
import { RangePicker } from "@/components/admin/RangePicker";
import { getDb } from "@/db";
import { type AdminSearchParams, param, rangeDto } from "@/lib/admin-page";
import { resolveRange } from "@/lib/admin-range";
import { requireAdminPage } from "@/server/auth";
import { semesterRows } from "@/server/data/admin-semesters";
import { noticeNumbers } from "@/server/data/admin-metrics";
import { listNoticesForAdmin } from "@/server/data/notices";
import { getSetting } from "@/server/data/settings";
import { listPeople } from "@/server/services/admin";

/** The banner, popups and broadcast email, and how the popups did in the range. */
export default async function AdminAnnounce({ searchParams }: { searchParams: AdminSearchParams }) {
  await requireAdminPage("/admin/announce");
  const sp = await searchParams;
  const r = resolveRange({ range: param(sp, "range"), from: param(sp, "from"), to: param(sp, "to") });
  const db = await getDb();
  const [announcement, notices, rows, people, numbers] = await Promise.all([getSetting(db, "announcement"), listNoticesForAdmin(db), semesterRows(db), listPeople(db), noticeNumbers(db, r)]);
  const popupRows = numbers.map((n) => ({ ...n, ctaRate: n.views ? Math.round((n.ctas / n.views) * 100) : null, dismissRate: n.views ? Math.round((n.dismissals / n.views) * 100) : null }));

  return (
    <div className="flex flex-col gap-5">
      <AnnounceTab
        announcement={announcement}
        semesters={rows}
        notices={notices}
        people={people.map((p) => ({ id: p.id, email: p.email, name: p.name, role: p.role, banned: p.banned, banReason: p.banReason, noEmail: p.noEmail, legacyNetid: p.legacyNetid, lastLoginAt: p.lastLoginAt?.toISOString() ?? null, createdAt: p.createdAt.toISOString(), post: null }))}
      />
      <RangePicker range={rangeDto(r)} />
      <Panel
        title="Popups in this range"
        hint="First views, dismissals and button clicks recorded in the range; each person counts once per popup (a signed-out visitor once a day)."
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
        {popupRows.length === 0 ? (
          <p className="text-sm text-ink-3">No popups yet.</p>
        ) : (
          <ScrollTable>
            <table className="w-full min-w-[28rem] text-sm">
              <thead className="text-left text-xs text-ink-3">
                <tr>
                  <th className="py-1 pr-3 font-normal">Popup</th>
                  <th className="pr-3 font-normal">Shown</th>
                  <th className="pr-3 font-normal">Dismissed</th>
                  <th className="font-normal">Button</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {popupRows.map((n) => (
                  <tr key={n.id} className="border-t border-line-light">
                    <td className="py-1.5 pr-3">
                      {n.title}
                      {n.active && <span className="ml-1.5 rounded-full bg-included-tint px-1.5 text-xs text-included-ink">live</span>}
                    </td>
                    <td className="pr-3">{n.views}</td>
                    <td className="pr-3">
                      {n.dismissals}
                      {n.dismissRate !== null && <span className="ml-1 text-xs text-ink-3">{n.dismissRate}%</span>}
                    </td>
                    <td>
                      {n.ctas}
                      {n.ctaRate !== null && <span className="ml-1 text-xs text-ink-3">{n.ctaRate}%</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollTable>
        )}
      </Panel>
    </div>
  );
}
