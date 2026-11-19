import { Card } from "@/components/admin/Card";
import { CsvButton } from "@/components/admin/CsvButton";
import { DataTable, Num } from "@/components/admin/DataTable";
import { MailTab } from "@/components/admin/MailTab";
import { MUTED, num } from "@/components/admin/ui";
import { getDb } from "@/db";
import { type AdminSearchParams, param } from "@/lib/admin-page";
import { resolveRange } from "@/lib/admin-range";
import { dayLabel } from "@/lib/chart";
import { requireAdminPage } from "@/server/auth";
import { mailNumbers } from "@/server/data/admin-metrics";
import { recentAdminMessages } from "@/server/data/admin-messages";

/**
 * One email to one address, previewed before it goes, and how many went in
 * the range. On a wide screen the composer is the left column, with the
 * range's numbers and then the history (MailTab orders it last) beside it;
 * the second row takes whatever height the composer has over the numbers.
 */
export default async function AdminMail({ searchParams }: { searchParams: AdminSearchParams }) {
  await requireAdminPage("/admin/mail");
  const sp = await searchParams;
  const r = resolveRange({ range: param(sp, "range"), from: param(sp, "from"), to: param(sp, "to") });
  const db = await getDb();
  const [history, counts] = await Promise.all([recentAdminMessages(db), mailNumbers(db, r)]);
  const totals = counts.reduce((t, c) => ({ sent: t.sent + c.sent, failed: t.failed + c.failed }), { sent: 0, failed: 0 });
  const total = "text-sm font-bold tabular-nums";
  return (
    <div className="grid items-start gap-4 lg:grid-cols-2 lg:grid-rows-[auto_1fr]">
      <MailTab history={history.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() }))} />
      <Card
        flush
        title="Mail sent"
        tip="One-off emails and request replies in the range. Broadcasts are not stored, so they aren't counted."
        actions={
          <>
            <span className={MUTED}>
              <span className={`${total} text-ink`}>{num(totals.sent)}</span> sent · <span className={`${total} ${totals.failed ? "text-error-ink" : "text-ink"}`}>{num(totals.failed)}</span> failed
            </span>
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
          </>
        }
      >
        <DataTable
          label={r.bucket === "day" ? "Mail sent by day" : "Mail sent by week"}
          rows={counts}
          rowKey={(c) => c.day}
          empty="None in this range."
          columns={[
            { key: "day", header: r.bucket === "day" ? "Day" : "Week", primary: true, cell: (c) => <span className="font-bold">{r.bucket === "day" ? dayLabel(c.day, true) : `Week of ${dayLabel(c.day)}`}</span> },
            { key: "sent", header: "Sent", numeric: true, cell: (c) => <Num n={c.sent} /> },
            { key: "failed", header: "Failed", numeric: true, cell: (c) => <Num n={c.failed} /> },
            { key: "pending", header: "Pending", numeric: true, cell: (c) => <Num n={c.pending} /> },
          ]}
        />
      </Card>
    </div>
  );
}
