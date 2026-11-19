import { Maintenance } from "@/components/admin/AnnounceTab";
import { StorageReadout } from "@/components/admin/ImagesTab";
import { Panel, ScrollTable } from "@/components/admin/Panel";
import { getDb } from "@/db";
import { formatBytes } from "@/lib/format";
import { shortDate } from "@/lib/dates";
import { requireAdminPage } from "@/server/auth";
import { tableCounts } from "@/server/data/admin-metrics";
import { CRON_NAMES } from "@/server/data/cron-runs";
import { getSetting } from "@/server/data/settings";
import { adminStats } from "@/server/services/admin";

const CRON_WHAT: Record<(typeof CRON_NAMES)[number], { when: string; what: string }> = {
  sweep: { when: "Daily, 4:20 am Eastern", what: "Clears stale uploads, codes and limits; fails stuck sends; fills missing areas." },
  digest: { when: "Hourly; acts Monday mornings", what: "The weekly saved-search email, while its switch is on." },
  "go-public": { when: "00:05 Eastern, 21 Nov", what: "One-off: makes public every listing whose poster never chose." },
};
/** The neon free plan's storage (docs/vercel-setup.md). */
const DB_CAP = 512 * 1024 * 1024;

const clock = (iso: string) => {
  const d = new Date(iso);
  return `${shortDate(d)}, ${d.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" })}`;
};

/** Running the site: storage against the plan's caps, the read-only switch, the crons' last runs, and the database. */
export default async function AdminSystem() {
  await requireAdminPage("/admin/system");
  const db = await getDb();
  const [stats, readOnly, runs, tables] = await Promise.all([adminStats(db), getSetting(db, "read_only"), getSetting(db, "cron_runs"), tableCounts(db)]);
  const dbPct = Math.min(100, Math.round((tables.databaseBytes / DB_CAP) * 100));

  return (
    <div className="flex flex-col gap-5">
      <Panel title="Photo storage" hint="Blob's allowances, from the database's own numbers.">
        <StorageReadout s={stats.storage} />
      </Panel>

      <Maintenance readOnly={readOnly} />

      <Panel title="Crons" hint="Each one's last run, recorded by the run itself (Vercel keeps its logs only an hour). Times are Eastern.">
        <ul className="flex flex-col divide-y divide-line-light text-sm">
          {CRON_NAMES.map((name) => {
            const run = runs[name];
            const facts = run ? Object.entries(run.summary).filter(([, v]) => v !== 0 && v !== false && v !== "") : [];
            return (
              <li key={name} className="flex flex-col gap-0.5 py-2">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="font-bold">{name}</span>
                  <span className={`text-sm ${run && !run.ok ? "text-error-ink" : "text-ink-2"}`}>{run ? `${run.ok ? "Ran" : "Failed"} ${clock(run.at)}` : "Not recorded yet"}</span>
                </div>
                <span className="text-xs text-ink-3">
                  {CRON_WHAT[name].when}. {CRON_WHAT[name].what}
                </span>
                {facts.length > 0 && <span className="text-xs text-ink-2 tabular-nums">{facts.map(([k, v]) => `${k} ${v}`).join(" · ")}</span>}
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel title="Database" hint={`${formatBytes(tables.databaseBytes)} of the ${formatBytes(DB_CAP)} the plan allows (${dbPct}%).`}>
        <ScrollTable>
          <table className="w-full max-w-sm text-sm">
            <tbody className="tabular-nums">
              {tables.rows.map((t) => (
                <tr key={t.table} className="border-t border-line-light first:border-t-0">
                  <td className="py-1 pr-3 text-ink-2">{t.table.replaceAll("_", " ")}</td>
                  <td className="text-right">{t.n.toLocaleString("en-US")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollTable>
      </Panel>
    </div>
  );
}
