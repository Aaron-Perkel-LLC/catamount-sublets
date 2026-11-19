import { Search } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { ADMIN_NAV } from "@/lib/admin-nav";
import { DeltaChip, RangeControl } from "./bits";
import { KpiChart } from "./KpiChart";
import type { OverviewVm } from "./model";
import { Tip } from "./Tip";

/**
 * Direction A, "Ledger": no sidebar. A title line with Find and the range,
 * the sections as a slim tab row, then one card that is the headline
 * numbers and the chart together; everything else is three columns of
 * quiet lists. Hairline borders, no shadows.
 */
export function DirectionA({ vm, base }: { vm: OverviewVm; base: string }) {
  return (
    <div className="flex flex-col gap-4 text-sm text-ink md:gap-5">
      <header className="flex flex-wrap items-center gap-x-2 gap-y-3">
        <h1 className="mr-auto text-xl leading-7 font-bold">Overview</h1>
        <FindStub />
        <div className="w-full md:w-auto">
          <RangeControl base={base} range={vm.range} />
        </div>
      </header>

      <nav aria-label="Admin sections" className="-mx-4 -mt-1 overflow-x-auto border-b border-line px-4 md:mx-0 md:px-0">
        <div className="flex w-max items-center gap-5 md:w-auto">
          {ADMIN_NAV.map((g) => {
            const on = g.id === "overview";
            const waiting = g.id === "people" ? vm.nav.waiting : 0;
            return (
              <Link
                key={g.id}
                href={`${g.items[0].href}?${vm.nav.query}`}
                aria-current={on ? "page" : undefined}
                className={`-mb-px inline-flex h-11 items-center gap-1.5 border-b-2 text-[13px] whitespace-nowrap md:h-10 ${on ? "border-lake font-bold text-ink" : "border-transparent text-ink-3 hover:text-ink"}`}
              >
                {g.label}
                {waiting > 0 && (
                  <span className="grid h-4 min-w-4 place-items-center rounded-full bg-maple px-1 text-[11px] font-bold text-paper" aria-label={`${waiting} waiting`}>
                    {waiting}
                  </span>
                )}
              </Link>
            );
          })}
          <span className="ml-auto hidden md:block">
            <Tip text={vm.range.captionTip} className="text-xs text-ink-3">
              {vm.range.caption}
            </Tip>
          </span>
        </div>
      </nav>
      <span className="-my-1 self-start md:hidden">
        <Tip text={vm.range.captionTip} className="text-xs text-ink-3">
          {vm.range.caption}
        </Tip>
      </span>

      <KpiChart kpis={vm.kpis} points={vm.points} mode={vm.mode} />

      <div className="grid items-start gap-4 md:grid-cols-3">
        <div className="flex flex-col gap-4">
          {vm.groups.map((g) => (
            <ListCard key={g.title} title={g.title}>
              <ul className="divide-y divide-line-light">
                {g.stats.map((s) => (
                  <li key={s.label} className="flex min-h-10 items-center justify-between gap-3 px-4">
                    {s.tip ? (
                      <Tip text={s.tip} quiet className="text-ink-2">
                        {s.label}
                      </Tip>
                    ) : (
                      <span className="text-ink-2">{s.label}</span>
                    )}
                    <span className="flex items-center gap-2">
                      <DeltaChip chip={s.chip} />
                      <span className={`min-w-6 text-right tabular-nums ${s.zero ? "text-ink-3/70" : "font-bold"}`}>{s.value}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </ListCard>
          ))}
        </div>

        <div className="flex flex-col gap-4">
          <ListCard title="Where views start">
            <BarRows rows={vm.sources} empty="No views in this range." />
          </ListCard>
          <ListCard title="Where shares go">
            <BarRows rows={vm.targets} empty="No shares in this range." />
          </ListCard>
        </div>

        <div className="flex flex-col gap-4">
          <ListCard title="Funnel" tip="Each step is its own count over the same range, not the same people followed through. Read it as orders of magnitude.">
            <BarRows rows={vm.funnel} numbered />
          </ListCard>
          <ListCard
            title="Needs attention"
            aside={
              vm.attention.total > 0 ? (
                <Link href={vm.attention.href} className="inline-flex min-h-11 items-center text-xs font-bold text-lake hover:underline md:min-h-0">
                  All {vm.attention.total}
                </Link>
              ) : null
            }
          >
            {vm.attention.rows.length === 0 ? (
              <p className="px-4 py-3 text-ink-3">Nothing needs a look.</p>
            ) : (
              <ul className="divide-y divide-line-light">
                {vm.attention.rows.map((a) => (
                  <li key={a.id}>
                    <Link href={a.href} className="flex min-h-11 items-center justify-between gap-3 px-4 py-1.5 hover:bg-cream/60">
                      <span className="min-w-0 truncate">
                        <span className="text-ink-3 tabular-nums">#{a.id}</span> <span className="font-bold">{a.label}</span>
                      </span>
                      <span className="flex shrink-0 gap-1">
                        {a.flags.map((f) => (
                          <span key={f.short} title={f.long} className="inline-flex h-5 items-center gap-1 rounded-md bg-tenant-tint px-1.5 text-[11px] font-bold whitespace-nowrap text-tenant-ink">
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
          </ListCard>
        </div>
      </div>
    </div>
  );
}

function ListCard({ title, tip, aside, children }: { title: string; tip?: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-paper pb-1">
      <div className="flex min-h-11 items-center justify-between gap-3 px-4">
        {tip ? (
          <Tip text={tip} className="text-[13px] font-bold">
            <h2>{title}</h2>
          </Tip>
        ) : (
          <h2 className="text-[13px] font-bold">{title}</h2>
        )}
        {aside}
      </div>
      {children}
    </section>
  );
}

/** Rows with a faint bar behind each label, as long as the row's share of the biggest. */
function BarRows({ rows, numbered = false, empty = "Nothing yet." }: { rows: { label: string; n: number; tip?: string }[]; numbered?: boolean; empty?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  if (rows.length === 0) return <p className="px-4 py-3 text-ink-3">{empty}</p>;
  return (
    <ol className="flex flex-col gap-1 px-2 pb-1">
      {rows.map((r, i) => (
        <li key={r.label} className="relative flex min-h-8 items-center justify-between gap-3 px-2" title={r.tip}>
          <span className="absolute inset-y-0 left-0 rounded-md bg-notice-tint" style={{ width: `${(r.n / max) * 100}%`, minWidth: r.n > 0 ? 3 : 0 }} aria-hidden />
          <span className="relative truncate text-ink">
            {numbered && <span className="mr-2 text-ink-3 tabular-nums">{i + 1}</span>}
            {r.label}
          </span>
          <span className={`relative tabular-nums ${r.n === 0 ? "text-ink-3/70" : "font-bold"}`}>{r.n.toLocaleString("en-US")}</span>
        </li>
      ))}
    </ol>
  );
}

/** Find's place in the header. A stand-in in the mockup: the real one keeps its behaviour. */
export function FindStub() {
  return (
    <button type="button" aria-label="Find a person, listing or page" className="inline-flex h-11 w-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-line bg-paper text-[13px] text-ink-3 hover:border-lake hover:text-lake md:h-8 md:w-44 md:justify-start md:px-2.5">
      <Search className="h-4 w-4 md:h-3.5 md:w-3.5" aria-hidden />
      <span className="hidden md:inline">Find…</span>
      <kbd className="ml-auto hidden rounded border border-line px-1 font-sans text-[11px] text-ink-3 md:inline">/</kbd>
    </button>
  );
}
