import { CsvButton } from "@/components/admin/CsvButton";
import { MailTab } from "@/components/admin/MailTab";
import { Panel } from "@/components/admin/Panel";
import { RangePicker } from "@/components/admin/RangePicker";
import { getDb } from "@/db";
import { type AdminSearchParams, param, rangeDto } from "@/lib/admin-page";
import { resolveRange } from "@/lib/admin-range";
import { dayLabel } from "@/lib/chart";
import { requireAdminPage } from "@/server/auth";
import { mailNumbers } from "@/server/data/admin-metrics";
import { recentAdminMessages } from "@/server/data/admin-messages";

/** One email to one address, previewed before it goes, and how many went in the range. */
export default async function AdminMail({ searchParams }: { searchParams: AdminSearchParams }) {
  await requireAdminPage("/admin/mail");
  const sp = await searchParams;
  const r = resolveRange({ range: param(sp, "range"), from: param(sp, "from"), to: param(sp, "to") });
  const db = await getDb();
  const [history, counts] = await Promise.all([recentAdminMessages(db), mailNumbers(db, r)]);
  const totals = counts.reduce((t, c) => ({ sent: t.sent + c.sent, failed: t.failed + c.failed }), { sent: 0, failed: 0 });
  return (
    <div className="flex flex-col gap-5">
      <MailTab history={history.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() }))} />
      <RangePicker range={rangeDto(r)} />
      <Panel
        title="Mail sent"
        hint={`${totals.sent} sent, ${totals.failed} failed in the range: one-off emails and request replies (broadcasts are not stored).`}
        actions={
          <CsvButton
            name="admin-mail"
            columns={[
              { key: "day", label: r.bucket === "day" ? "day" : "week_of" },
              { key: "sent", label: "sent" },
              { key: "failed", label: "failed" },
              { key: "pending", label: "pending" },
            ]}
            rows={counts}
          />
        }
      >
        {counts.length === 0 ? (
          <p className="text-sm text-ink-3">None in this range.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line-light text-sm tabular-nums">
            {counts.map((c) => (
              <li key={c.day} className="flex justify-between gap-3 py-1.5">
                <span>{r.bucket === "day" ? dayLabel(c.day, true) : `Week of ${dayLabel(c.day)}`}</span>
                <span>
                  {c.sent} sent{c.failed ? `, ${c.failed} failed` : ""}
                  {c.pending ? `, ${c.pending} pending` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
