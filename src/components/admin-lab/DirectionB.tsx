import { ChevronDown } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { ADMIN_NAV } from "@/lib/admin-nav";
import { DeltaChip, RangeControl, Sparkline, SplitBar } from "./bits";
import { FindStub } from "./DirectionA";
import type { OverviewVm } from "./model";
import { Tip } from "./Tip";
import { TrendChart } from "./TrendChart";

const CARD = "rounded-xl bg-paper shadow-[0_1px_2px_rgb(28_35_40/0.07),0_4px_12px_rgb(28_35_40/0.04)]";

/**
 * Direction B, "Console": a quiet sidebar, four hero cards each with its
 * own sparkline, then a main column (one chart, the funnel as steps, where
 * views start and shares go) beside a narrow panel of secondary numbers.
 * Soft shadows, no borders.
 */
export function DirectionB({ vm, base }: { vm: OverviewVm; base: string }) {
  const views = vm.kpis.find((k) => k.key === "views");
  const contacts = vm.kpis.find((k) => k.key === "contacts");
  const funnelMax = Math.max(1, ...vm.funnel.map((f) => f.n));
  return (
    <div className="flex flex-col gap-4 text-sm text-ink md:grid md:grid-cols-[10.5rem_minmax(0,1fr)] md:items-start md:gap-8">
      <SideNav waiting={vm.nav.waiting} query={vm.nav.query} />

      <div className="flex min-w-0 flex-col gap-4 md:gap-5">
        <header className="flex flex-wrap items-center gap-x-2 gap-y-3">
          <div className="mr-auto flex flex-col">
            <h1 className="text-xl leading-7 font-bold">Overview</h1>
            <Tip text={vm.range.captionTip} className="self-start text-xs text-ink-3">
              {vm.range.caption}
            </Tip>
          </div>
          <FindStub />
          <div className="w-full lg:w-auto">
            <RangeControl base={base} range={vm.range} tone="sunk" />
          </div>
        </header>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {vm.kpis.map((k) => (
            <section key={k.key} className={`${CARD} flex min-w-0 flex-col gap-2 p-4`}>
              <Tip text={k.tip} className="self-start text-xs text-ink-3">
                <h2>{k.label}</h2>
              </Tip>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-[30px] leading-8 font-bold tabular-nums">{k.value}</span>
                <DeltaChip chip={k.chip} />
              </div>
              <Sparkline values={k.series} className="mt-1 h-9 w-full" />
              {k.split && <SplitBar parts={k.split} />}
            </section>
          ))}
        </div>

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
          <div className="flex min-w-0 flex-col gap-4">
            <section className={`${CARD} px-4 pt-3 pb-1`}>
              <div className="mb-2 flex min-h-8 flex-wrap items-center justify-between gap-x-4">
                {vm.mode === "rolling" ? (
                  <Tip text="Each point is the total for the 7 days ending that day, so one quiet or busy day doesn't swing the line. The cards above are the whole range." className="text-[13px] font-bold">
                    <h2>Activity</h2>
                  </Tip>
                ) : (
                  <h2 className="text-[13px] font-bold">Activity</h2>
                )}
                <div className="flex items-center gap-3 text-xs text-ink-3" aria-hidden>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-3 rounded-sm bg-chart-lake/25 ring-1 ring-chart-lake/60" />
                    Views
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-0.5 w-3 rounded-full bg-chart-maple" />
                    Got in touch
                  </span>
                  <span>{vm.mode === "rolling" ? "7-day totals" : "by day"}</span>
                </div>
              </div>
              <TrendChart
                label="Views and people who got in touch"
                points={vm.points}
                series={[
                  { key: "views", label: "views", color: "var(--color-chart-lake)", kind: "area", values: views?.series ?? [] },
                  { key: "contacts", label: "got in touch", color: "var(--color-chart-maple)", kind: "line", values: contacts?.series ?? [] },
                ]}
              />
            </section>

            <section className={`${CARD} p-4`}>
              <Tip text="Each step is its own count over the same range, not the same people followed through. Read it as orders of magnitude." className="mb-3 text-[13px] font-bold">
                <h2>Funnel</h2>
              </Tip>
              <ol className="grid gap-x-3 gap-y-3 sm:grid-cols-5">
                {vm.funnel.map((f, i) => (
                  <li key={f.label} className="flex min-w-0 flex-col gap-1.5" title={f.tip}>
                    <div className="flex items-baseline justify-between gap-2 sm:flex-col sm:gap-0.5">
                      <span className="truncate text-xs text-ink-3">
                        <span className="tabular-nums">{i + 1}</span> {f.label}
                      </span>
                      <span className={`text-lg leading-6 tabular-nums ${f.n === 0 ? "text-ink-3/70" : "font-bold"}`}>{f.n.toLocaleString("en-US")}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-line-light">
                      <div className="h-full rounded-full bg-chart-lake" style={{ width: `${(f.n / funnelMax) * 100}%`, minWidth: f.n > 0 ? 4 : 0 }} />
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            <div className="grid items-start gap-4 sm:grid-cols-2">
              <Breakdown title="Where views start" rows={vm.sources} empty="No views in this range." />
              <Breakdown title="Where shares go" rows={vm.targets} empty="No shares in this range." />
            </div>
          </div>

          <aside className="flex flex-col gap-4">
            <section className={`${CARD} py-2`}>
              {vm.groups.map((g, gi) => (
                <div key={g.title} className={gi > 0 ? "mt-2 border-t border-line-light pt-2" : ""}>
                  <h2 className="px-4 py-1.5 text-[11px] font-bold tracking-wider text-ink-3 uppercase">{g.title}</h2>
                  <ul>
                    {g.stats.map((s) => (
                      <li key={s.label} className="flex min-h-9 items-center justify-between gap-2 px-4">
                        {s.tip ? (
                          <Tip text={s.tip} quiet className="text-[13px] text-ink-2">
                            {s.label}
                          </Tip>
                        ) : (
                          <span className="text-[13px] text-ink-2">{s.label}</span>
                        )}
                        <span className="flex items-center gap-2">
                          <DeltaChip chip={s.chip} />
                          <span className={`min-w-6 text-right tabular-nums ${s.zero ? "text-ink-3/70" : "font-bold"}`}>{s.value}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>

            <section className={`${CARD} py-2`}>
              <div className="flex min-h-9 items-center justify-between gap-2 px-4">
                <h2 className="flex items-center gap-2 text-[13px] font-bold">
                  Needs attention
                  {vm.attention.total > 0 && <span className="grid h-4 min-w-4 place-items-center rounded-full bg-maple px-1 text-[11px] text-paper">{vm.attention.total}</span>}
                </h2>
                {vm.attention.total > 0 && (
                  <Link href={vm.attention.href} className="inline-flex min-h-11 items-center text-xs font-bold text-lake hover:underline lg:min-h-0">
                    View all
                  </Link>
                )}
              </div>
              {vm.attention.rows.length === 0 ? (
                <p className="px-4 py-2 text-[13px] text-ink-3">Nothing needs a look.</p>
              ) : (
                <ul>
                  {vm.attention.rows.map((a) => (
                    <li key={a.id}>
                      <Link href={a.href} className="flex min-h-11 flex-col justify-center gap-0.5 px-4 py-1.5 hover:bg-cream/70">
                        <span className="truncate text-[13px]">
                          <span className="text-ink-3 tabular-nums">#{a.id}</span> <span className="font-bold">{a.label}</span>
                        </span>
                        <span className="flex flex-wrap items-center gap-x-2.5 text-[11px] text-ink-3">
                          {a.flags.map((f) => (
                            <span key={f.short} title={f.long} className="inline-flex items-center gap-1">
                              <span className="h-1.5 w-1.5 rounded-full bg-maple" aria-hidden />
                              {f.short}
                            </span>
                          ))}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}

function Breakdown({ title, rows, empty }: { title: string; rows: { label: string; n: number }[]; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <section className={`${CARD} p-4`}>
      <h2 className="mb-3 text-[13px] font-bold">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-[13px] text-ink-3">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {rows.map((r) => (
            <li key={r.label} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="truncate text-ink-2">{r.label}</span>
                <span className="font-bold tabular-nums">{r.n.toLocaleString("en-US")}</span>
              </div>
              <div className="h-1 rounded-full bg-line-light">
                <div className="h-full rounded-full bg-chart-lake" style={{ width: `${(r.n / max) * 100}%`, minWidth: 3 }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function NavLinks({ waiting, query, row }: { waiting: number; query: string; row: string }) {
  const item = (href: string, label: string, on: boolean, badge: number): ReactNode => (
    <Link href={`${href}?${query}`} aria-current={on ? "page" : undefined} className={`flex items-center justify-between rounded-md px-2 text-[13px] ${row} ${on ? "bg-paper font-bold text-ink shadow-[0_1px_2px_rgb(28_35_40/0.08)]" : "text-ink-2 hover:bg-line-light/70 hover:text-ink"}`}>
      {label}
      {badge > 0 && (
        <span className="grid h-4 min-w-4 place-items-center rounded-full bg-maple px-1 text-[11px] font-bold text-paper" aria-label={`${badge} waiting`}>
          {badge}
        </span>
      )}
    </Link>
  );
  return (
    <ul className="flex flex-col gap-4">
      {ADMIN_NAV.map((g) =>
        g.items.length === 1 ? (
          <li key={g.id}>{item(g.items[0].href, g.label, g.id === "overview", 0)}</li>
        ) : (
          <li key={g.id}>
            <div className="px-2 pb-1 text-[11px] font-bold tracking-wider text-ink-3 uppercase">{g.label}</div>
            <ul className="flex flex-col gap-px">
              {g.items.map((i) => (
                <li key={i.id}>{item(i.href, i.label, false, i.id === "requests" ? waiting : 0)}</li>
              ))}
            </ul>
          </li>
        ),
      )}
    </ul>
  );
}

/** Desktop: the sections down the side, small and quiet. Phone: one 44 px row that opens them. */
function SideNav({ waiting, query }: { waiting: number; query: string }) {
  return (
    <>
      <nav aria-label="Admin sections" className="hidden md:sticky md:top-4 md:block">
        <NavLinks waiting={waiting} query={query} row="h-8" />
      </nav>
      <details className={`${CARD} group md:hidden`}>
        <summary className="flex h-11 list-none items-center justify-between px-4 text-[13px] font-bold [&::-webkit-details-marker]:hidden">
          <span>
            <span className="font-normal text-ink-3">Admin / </span>Overview
          </span>
          <ChevronDown className="h-4 w-4 text-ink-3 transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <nav aria-label="Admin sections" className="border-t border-line-light p-2">
          <NavLinks waiting={waiting} query={query} row="h-11" />
        </nav>
      </details>
    </>
  );
}
