import { CsvButton } from "@/components/admin/CsvButton";
import { DigestTab } from "@/components/admin/DigestTab";
import { Panel, ScrollTable } from "@/components/admin/Panel";
import { RangePicker } from "@/components/admin/RangePicker";
import { getDb } from "@/db";
import { type AdminSearchParams, param, rangeDto } from "@/lib/admin-page";
import { resolveRange } from "@/lib/admin-range";
import { dayLabel } from "@/lib/chart";
import { requireAdminPage } from "@/server/auth";
import { digestWeeks } from "@/server/data/admin-metrics";

/** The weekly saved-search email: its switch, who would get it, a test, and each week's sends in the range. */
export default async function AdminDigest({ searchParams }: { searchParams: AdminSearchParams }) {
  await requireAdminPage("/admin/digest");
  const sp = await searchParams;
  const r = resolveRange({ range: param(sp, "range"), from: param(sp, "from"), to: param(sp, "to") });
  const weeks = await digestWeeks(await getDb(), r);
  return (
    <div className="flex flex-col gap-5">
      <DigestTab />
      <RangePicker range={rangeDto(r)} />
      <Panel
        title="Digest by week"
        hint="Sent, empty (nothing new, nothing sent) and failed per digest morning; turned off that week, by the email's link or from the account page (a subscription's current state, so someone who turned it back on isn't counted)."
        actions={
          <CsvButton
            name="digest-weeks"
            columns={[
              { key: "week", label: "week" },
              { key: "sent", label: "sent" },
              { key: "empty", label: "empty" },
              { key: "failed", label: "failed" },
              { key: "pending", label: "pending" },
              { key: "leftByLink", label: "unsubscribed_by_link" },
              { key: "leftFromAccount", label: "turned_off_in_account" },
            ]}
            rows={weeks}
          />
        }
      >
        {weeks.length === 0 ? (
          <p className="text-sm text-ink-3">No digest weeks in this range.</p>
        ) : (
          <ScrollTable>
            <table className="w-full min-w-[30rem] text-sm">
              <thead className="text-left text-xs text-ink-3">
                <tr>
                  <th className="py-1 pr-3 font-normal">Week</th>
                  <th className="pr-3 font-normal">Sent</th>
                  <th className="pr-3 font-normal">Empty</th>
                  <th className="pr-3 font-normal">Failed</th>
                  <th className="font-normal">Turned off</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {weeks.map((w) => (
                  <tr key={w.week} className="border-t border-line-light">
                    <td className="py-1.5 pr-3">{dayLabel(w.week)}</td>
                    <td className="pr-3">{w.sent}</td>
                    <td className="pr-3">{w.empty}</td>
                    <td className="pr-3">{w.failed}</td>
                    <td>
                      {w.leftByLink + w.leftFromAccount}
                      {w.leftByLink + w.leftFromAccount > 0 && <span className="ml-1 text-xs text-ink-3">({w.leftByLink} by link)</span>}
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
