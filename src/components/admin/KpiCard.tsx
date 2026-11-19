"use client";

import { createContext, type ReactNode, useContext, useMemo, useState } from "react";
import type { Chip } from "@/lib/admin-delta";
import type { TrendMode, TrendPoint } from "@/lib/admin-trend";
import { Card } from "./Card";
import { DeltaChip } from "./DeltaChip";
import { Sparkline } from "./Sparkline";
import { SplitBar } from "./SplitBar";
import { Tip } from "./Tip";
import { TrendChart } from "./TrendChart";
import { CARD, LABEL } from "./ui";

export interface Kpi {
  key: string;
  label: string;
  /** Already formatted: "1,204", "31%", "—". */
  value: string;
  /** A quiet suffix on the number's baseline ("/ 86"). */
  of?: string;
  chip?: Chip | null;
  /** What the number counts, behind the ⓘ. */
  tip?: string;
  /** One value per chart point (null: nothing to divide by). With it the card has a sparkline and can drive the chart. */
  series?: (number | null)[];
  unit?: "count" | "percent";
  /** Two parts of the whole, as a labelled two-tone bar. */
  split?: { label: string; n: number }[];
  /** Where the chart's points differ from the card's number, for the chart's ⓘ. */
  seriesNote?: string;
  /** More rows for the chart's readout when this card is picked. */
  extra?: { label: string; values: number[] }[];
}

const Picked = createContext<{ key: string; pick: (key: string) => void } | null>(null);

/** Shares which KPI card is picked between the cards and the chart, wherever the page lays them out. */
export function KpiTabs({ first, children }: { first: string; children: ReactNode }) {
  const [key, pick] = useState(first);
  const value = useMemo(() => ({ key, pick }), [key]);
  return <Picked.Provider value={value}>{children}</Picked.Provider>;
}

/**
 * A headline number: label, the number in tabular figures, a delta chip and
 * (given a series) a sparkline. No sentences: the explanation is behind the
 * ⓘ. Inside KpiTabs a card with a series is also a button: pressing it puts
 * its series on the chart, and the pressed card is ringed.
 */
export function KpiCard({ kpi }: { kpi: Kpi }) {
  const tabs = useContext(Picked);
  const tab = tabs && kpi.series ? tabs : null;
  const on = tab?.key === kpi.key;
  return (
    <section className={`${CARD} relative flex min-w-0 flex-col gap-2 p-4 ${on ? "ring-2 ring-lake" : tab ? "hover:ring-1 hover:ring-line" : ""}`}>
      {tab && <button type="button" aria-pressed={on} aria-label={`${kpi.label}: ${kpi.value}. Show on the chart.`} onClick={() => tab.pick(kpi.key)} className="absolute inset-0 rounded-xl" />}
      <h2 className={`self-start ${LABEL} ${on ? "font-bold text-ink" : ""}`}>
        {kpi.tip ? (
          <Tip text={kpi.tip} className="z-10">
            {kpi.label}
          </Tip>
        ) : (
          kpi.label
        )}
      </h2>
      <div className="pointer-events-none flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-[30px] leading-8 font-bold tabular-nums">{kpi.value}</span>
        {kpi.of && <span className="self-end pb-0.5 text-[13px] text-ink-3 tabular-nums">{kpi.of}</span>}
        <DeltaChip chip={kpi.chip} />
      </div>
      {kpi.series && (
        <div className="pointer-events-none pt-1">
          <Sparkline values={kpi.series} />
        </div>
      )}
      {kpi.split && (
        <div className="pointer-events-none">
          <SplitBar parts={kpi.split} />
        </div>
      )}
    </section>
  );
}

/** The KPI cards in a row of four (two by two on a phone). */
export function KpiRow({ kpis }: { kpis: Kpi[] }) {
  const tabs = useContext(Picked);
  return (
    <div role={tabs ? "group" : undefined} aria-label={tabs ? "Headline numbers; press one to chart it" : undefined} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {kpis.map((k) => (
        <KpiCard key={k.key} kpi={k} />
      ))}
    </div>
  );
}

/** The chart for whichever KPI card is picked, on that metric's own scale. */
export function KpiTrend({ kpis, points, mode }: { kpis: Kpi[]; points: TrendPoint[]; mode: TrendMode }) {
  const tabs = useContext(Picked);
  const kpi = kpis.find((k) => k.key === tabs?.key && k.series) ?? kpis.find((k) => k.series);
  if (!kpi?.series) return null;
  const tip = [mode === "rolling" ? "Each point is the total for the 7 days ending that day, so one quiet or busy day doesn't swing the line. The card above is the whole range." : "", kpi.seriesNote ?? ""].filter(Boolean).join(" ");
  return (
    <Card title={kpi.label} tip={tip || undefined} actions={<span className="text-xs text-ink-3">{mode === "rolling" ? "7-day totals" : "By day"}</span>}>
      <div aria-live="polite" className="-mb-3">
        <TrendChart label={kpi.label} points={points} unit={kpi.unit ?? "count"} series={[{ key: kpi.key, label: kpi.label.toLowerCase(), color: "var(--color-chart-lake)", kind: "area", values: kpi.series }]} extra={kpi.extra ?? []} />
      </div>
    </Card>
  );
}
