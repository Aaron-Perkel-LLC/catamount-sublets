"use client";

import { useState } from "react";
import { DeltaChip } from "./bits";
import type { ChartPointVm, Kpi, KpiKey } from "./model";
import { Tip } from "./Tip";
import { TrendChart } from "./TrendChart";

/**
 * Direction A's centrepiece: the four headline numbers as a strip across the
 * top of one card, and the chart under them drawing whichever is picked, on
 * its own scale.
 */
export function KpiChart({ kpis, points, mode }: { kpis: Kpi[]; points: ChartPointVm[]; mode: "day" | "rolling" }) {
  const [key, setKey] = useState<KpiKey>(kpis[0].key);
  const kpi = kpis.find((k) => k.key === key) ?? kpis[0];
  return (
    <section className="rounded-xl border border-line bg-paper">
      <div role="tablist" aria-label="Chart" className="grid grid-cols-2 md:grid-cols-4">
        {kpis.map((k, i) => {
          const on = k.key === kpi.key;
          return (
            <div
              key={k.key}
              className={`relative flex min-h-24 flex-col justify-center gap-1 border-line-light px-4 py-4 md:px-5 ${i % 2 === 1 ? "border-l" : "md:border-l"} ${i === 0 ? "md:border-l-0" : ""} ${i > 1 ? "border-t md:border-t-0" : ""} ${on ? "" : "hover:bg-cream/60"}`}
            >
              <button type="button" role="tab" aria-selected={on} aria-label={`${k.label}: ${k.value}. Show on the chart.`} onClick={() => setKey(k.key)} className="absolute inset-0 rounded-[inherit] outline-offset-[-3px]" />
              {on && <span className="absolute inset-x-4 -bottom-px z-10 h-0.5 rounded-t bg-lake md:inset-x-5" aria-hidden />}
              <Tip text={k.tip} className={`z-10 self-start text-xs ${on ? "font-bold text-ink" : "text-ink-3"}`}>
                {k.label}
              </Tip>
              <div className="pointer-events-none flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-[28px] leading-8 font-bold tabular-nums">{k.value}</span>
                <DeltaChip chip={k.chip} />
              </div>
            </div>
          );
        })}
      </div>
      <div role="tabpanel" className="border-t border-line-light px-4 pt-4 pb-1 md:px-5">
        <div className="mb-2 flex items-center justify-between text-xs text-ink-3">
          {mode === "rolling" ? (
            <Tip text="Each point is the total for the 7 days ending that day, so one quiet or busy day doesn't swing the line. The big numbers above are the whole range.">
              {kpi.label}, 7-day totals
            </Tip>
          ) : (
            <span>{kpi.label}, by day</span>
          )}
        </div>
        <TrendChart
          label={kpi.label}
          points={points}
          unit={kpi.unit}
          series={[{ key: kpi.key, label: kpi.label.toLowerCase(), color: "var(--color-chart-lake)", kind: "area", values: kpi.series }]}
          extra={
            kpi.key === "views"
              ? [
                  { label: "signed out", values: points.map((p) => p.out) },
                  { label: "signed in", values: points.map((p) => p.in) },
                ]
              : []
          }
        />
      </div>
    </section>
  );
}
