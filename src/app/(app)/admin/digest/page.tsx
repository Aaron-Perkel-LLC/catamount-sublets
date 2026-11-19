import { Card } from "@/components/admin/Card";
import { CsvButton } from "@/components/admin/CsvButton";
import { DataTable, Num } from "@/components/admin/DataTable";
import { DigestTab } from "@/components/admin/DigestTab";
import { Pill } from "@/components/admin/Pill";
import { getDb } from "@/db";
import { type AdminSearchParams, param } from "@/lib/admin-page";
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
    <div className="flex flex-col gap-4">
      <DigestTab />
      <Card
        flush
        title="Digest by week"
        tip="Each digest morning in the range: sent, empty (nothing new, nothing sent) and failed. Turned off counts who turned it off that week, by the email's link or from the account page; it is a subscription's current state, so someone who turned it back on isn't counted."
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
        <DataTable
          label="Digest by week"
          rows={weeks}
          rowKey={(w) => w.week}
          empty="No digest weeks in this range."
          columns={[
            { key: "week", header: "Week", primary: true, cell: (w) => <span className="font-bold">{dayLabel(w.week)}</span> },
            { key: "sent", header: "Sent", numeric: true, cell: (w) => <Num n={w.sent} /> },
            { key: "empty", header: "Empty", numeric: true, cell: (w) => <Num n={w.empty} /> },
            { key: "failed", header: "Failed", numeric: true, cell: (w) => (w.failed > 0 ? <Pill tone="bad">{w.failed}</Pill> : <Num n={0} />) },
            {
              key: "left",
              header: "Turned off",
              numeric: true,
              cell: (w) => (
                <span className="whitespace-nowrap">
                  <Num n={w.leftByLink + w.leftFromAccount} />
                  {w.leftByLink + w.leftFromAccount > 0 && <span className="ml-1.5 text-[11px] text-ink-3">({w.leftByLink} by link)</span>}
                </span>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
