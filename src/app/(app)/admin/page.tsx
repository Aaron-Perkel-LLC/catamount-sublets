import Link from "next/link";
import { BarList } from "@/components/admin/BarList";
import { Card, Empty } from "@/components/admin/Card";
import { CsvButton } from "@/components/admin/CsvButton";
import { Funnel } from "@/components/admin/Funnel";
import { KpiRow, KpiTabs, KpiTrend } from "@/components/admin/KpiCard";
import { LegacyHashRedirect } from "@/components/admin/LegacyHashRedirect";
import { CountBadge } from "@/components/admin/Pill";
import { StatList } from "@/components/admin/StatList";
import { Tip } from "@/components/admin/Tip";
import { CARD, CARD_TITLE, LINK } from "@/components/admin/ui";
import { getDb } from "@/db";
import { ATTENTION, ATTENTION_RULES, ATTENTION_SHORT } from "@/lib/admin-attention";
import { type AdminSearchParams, param } from "@/lib/admin-page";
import { resolveRange } from "@/lib/admin-range";
import { requireAdminPage } from "@/server/auth";
import { overviewView } from "./overview";

/**
 * The admin's landing page. Four headline numbers against the period before,
 * each with its shape over the range; one chart, drawing whichever of them
 * is picked; then the funnel and where views and shares come from, beside a
 * narrow panel of everything secondary and the listings that need a look.
 */
export default async function AdminOverview({ searchParams }: { searchParams: AdminSearchParams }) {
  await requireAdminPage("/admin");
  const sp = await searchParams;
  const r = resolveRange({
    range: param(sp, "range"),
    from: param(sp, "from"),
    to: param(sp, "to"),
  });
  const v = await overviewView(await getDb(), r);

  return (
    <KpiTabs first="views">
      <LegacyHashRedirect />
      <KpiRow kpis={v.kpis} />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <KpiTrend kpis={v.kpis} points={v.points} bucket={v.bucket} />
          <Card title="Funnel" tip="Each step is its own count over the same range, not the same people followed through: signed-out and signed-in views are different visits. Read it as orders of magnitude.">
            <Funnel steps={v.funnel} />
          </Card>
          <div className="grid items-start gap-4 sm:grid-cols-2">
            <Card title="Where views start">
              <BarList rows={v.sources} empty="No views in this range." />
            </Card>
            <Card title="Where shares go">
              <BarList rows={v.targets} empty="No shares in this range." />
            </Card>
          </div>
        </div>

        <aside className="flex flex-col gap-4">
          <section className={`${CARD} py-2`} aria-label="Board, audience and outcomes">
            <StatList groups={v.groups} />
          </section>

          <section className={`${CARD} py-2`} aria-labelledby="attention-h">
            <div className="flex min-h-9 items-center justify-between gap-2 px-4">
              <h2 id="attention-h" className={`${CARD_TITLE} flex items-center gap-2`}>
                <Tip text={ATTENTION_RULES}>Needs attention</Tip>
                <CountBadge n={v.attention.length} />
              </h2>
              {v.attention.length > 0 && (
                <CsvButton
                  name="needs-attention"
                  columns={[
                    { key: "id", label: "id" },
                    { key: "listing", label: "listing" },
                    { key: "reasons", label: "reasons" },
                    { key: "views", label: "views" },
                    { key: "contacts", label: "contacts" },
                    { key: "age", label: "age_days" },
                  ]}
                  rows={v.attention.map((a) => ({
                    id: a.id,
                    listing: a.label,
                    reasons: a.flags.map((f) => ATTENTION[f]).join("; "),
                    views: a.views,
                    contacts: a.contacts,
                    age: a.ageDays,
                  }))}
                />
              )}
            </div>
            {v.attention.length === 0 ? (
              <div className="px-4 py-2">
                <Empty>Nothing needs a look.</Empty>
              </div>
            ) : (
              <>
                <ul>
                  {v.attention.slice(0, 5).map((a) => (
                    <li key={a.id}>
                      <Link href={`/admin/listings?${v.query}#post:${a.id}`} className="flex min-h-11 flex-col justify-center gap-0.5 px-4 py-1.5 hover:bg-cream/70">
                        <span className="truncate text-[13px]">
                          <span className="text-ink-3 tabular-nums">#{a.id}</span> <span className="font-bold">{a.label}</span>
                        </span>
                        <span className="flex flex-wrap items-center gap-x-2.5 text-[11px] text-ink-3">
                          {a.flags.map((f) => (
                            <span key={f} title={ATTENTION[f]} className="inline-flex items-center gap-1">
                              <span className="h-1.5 w-1.5 rounded-full bg-maple" aria-hidden />
                              {ATTENTION_SHORT[f]}
                            </span>
                          ))}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <div className="px-4">
                  <Link href={`/admin/listings?${v.query}&view=attention`} className={LINK}>
                    All {v.attention.length} in All listings
                  </Link>
                </div>
              </>
            )}
          </section>
        </aside>
      </div>
    </KpiTabs>
  );
}
