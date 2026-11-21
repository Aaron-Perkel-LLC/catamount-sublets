import { Maintenance } from "@/components/admin/AnnounceTab";
import { Card } from "@/components/admin/Card";
import { DataTable, Num } from "@/components/admin/DataTable";
import { StorageReadout } from "@/components/admin/ImagesTab";
import { Pill } from "@/components/admin/Pill";
import { Tip } from "@/components/admin/Tip";
import { MUTED } from "@/components/admin/ui";
import { getDb } from "@/db";
import { formatBytes } from "@/lib/format";
import { shortDate } from "@/lib/dates";
import { requireAdminPage } from "@/server/auth";
import { tableCounts } from "@/server/data/admin-metrics";
import { CRON_NAMES } from "@/server/data/cron-runs";
import { getSetting } from "@/server/data/settings";
import { adminStats } from "@/server/services/admin";

const CRON_WHAT: Record<(typeof CRON_NAMES)[number], { when: string; what: string }> = {
  sweep: { when: "Daily at 09:20 UTC (4:20 am Eastern in winter, 5:20 in summer)", what: "Clears stale uploads, codes and limits; fails stuck sends; fills missing areas." },
  digest: { when: "Hourly; acts Monday mornings", what: "The weekly saved-search email, while its switch is on." },
  email: { when: "Hourly, at half past; acts only while an email is still sending", what: "Finishes an email of yours that was cut off or is waiting to retry a recipient." },
};
/** The neon free plan's storage (docs/vercel-setup.md). */
const DB_CAP = 512 * 1024 * 1024;

const clock = (iso: string) => {
  const d = new Date(iso);
  return `${shortDate(d)}, ${d.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" })}`;
};
/** A run's summary as "sent 3 · empty 1", noughts and blanks left out. */
const facts = (summary: Record<string, unknown>) =>
  Object.entries(summary)
    .filter(([, v]) => v !== 0 && v !== false && v !== "")
    .map(([k, v]) => `${k} ${v}`);

/**
 * Running the site, as two columns of cards on a wide screen: storage
 * against the plan's caps and the crons' last runs, beside the read-only
 * switch and the database. What a cron does and when is behind its ⓘ.
 */
export default async function AdminSystem() {
  await requireAdminPage("/admin/system");
  const db = await getDb();
  const [stats, readOnly, runs, tables] = await Promise.all([adminStats(db), getSetting(db, "read_only"), getSetting(db, "cron_runs"), tableCounts(db)]);
  const dbPct = Math.min(100, Math.round((tables.databaseBytes / DB_CAP) * 100));

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-4">
        <StorageReadout s={stats.storage} />

        <Card flush title="Crons" tip="Each one's last run, recorded by the run itself (Vercel keeps its logs only an hour). Times are Eastern.">
          <ul>
            {CRON_NAMES.map((name) => {
              const run = runs[name];
              const did = run ? facts(run.summary) : [];
              return (
                <li key={name} className="flex flex-col gap-1 border-t border-line-light px-4 py-3 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <span className="flex items-center gap-2">
                      <Tip text={`${CRON_WHAT[name].when}. ${CRON_WHAT[name].what}`} className="text-[13px] font-bold">
                        {name}
                      </Tip>
                      {run ? <Pill tone={run.ok ? "good" : "bad"}>{run.ok ? "Ran" : "Failed"}</Pill> : <Pill>Not recorded</Pill>}
                    </span>
                    {run && <span className={`${MUTED} tabular-nums`}>{clock(run.at)}</span>}
                  </div>
                  {did.length > 0 && <span className="text-xs text-ink-3 tabular-nums">{did.join(" · ")}</span>}
                  {[
                    ["Last did something", runs[`${name}:acted`]],
                    ["Last failed", runs[`${name}:failed`]],
                  ].map(([label, r]) =>
                    r && typeof r === "object" && r.at !== run?.at ? (
                      <span key={String(label)} className={`text-xs tabular-nums ${label === "Last failed" ? "text-error-ink" : "text-ink-3"}`}>
                        {[`${String(label)} ${clock(r.at)}`, ...facts(r.summary)].join(" · ")}
                      </span>
                    ) : null,
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <Maintenance readOnly={readOnly} />

        <Card
          flush
          title="Database"
          tip={`${formatBytes(tables.databaseBytes)} of the ${formatBytes(DB_CAP)} the plan allows (${dbPct}%).`}
          actions={
            <span className={`${MUTED} tabular-nums`}>
              <span className="text-sm font-bold text-ink">{formatBytes(tables.databaseBytes)}</span> / {formatBytes(DB_CAP)}
            </span>
          }
        >
          <DataTable
            label="Rows per table"
            rows={tables.rows}
            rowKey={(t) => t.table}
            columns={[
              {
                key: "table",
                header: "Table",
                primary: true,
                // On a phone the count rides on the name's line (a labelled "Rows" line per table would double the list), and the Rows cell is dropped.
                cell: (t) => (
                  <span className="flex items-baseline justify-between gap-4">
                    {t.table.replaceAll("_", " ")}
                    <span className="md:hidden">
                      <Num n={t.n} />
                    </span>
                  </span>
                ),
              },
              { key: "rows", header: "Rows", numeric: true, desktopOnly: true, cell: (t) => <Num n={t.n} /> },
            ]}
          />
        </Card>
      </div>
    </div>
  );
}
