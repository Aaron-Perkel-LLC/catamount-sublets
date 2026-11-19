"use client";

import { type KeyboardEvent, type PointerEvent, useLayoutEffect, useRef, useState } from "react";
import type { BarBucket, TrendPoint } from "@/lib/admin-trend";
import { niceTicks } from "@/lib/chart";

export interface BarSeries {
  key: string;
  label: string;
  /** A chart token, e.g. var(--color-chart-lake). */
  color: string;
  values: (number | null)[];
}

const TOP = 8;
const AXIS_H = 24;
const LEFT = 36;
const RIGHT = 8;
const TIP_W = 200;
const LINE = "var(--color-ink)";
const cap = (t: string) => t[0].toUpperCase() + t.slice(1);

/**
 * The admin's one chart: a bar per day (or week) on hairline gridlines with
 * one y-axis, each bar that day's own count, and a thin line over them for
 * the 7-day average. More than one series stacks (they share a unit, or they
 * are separate charts). Hover, touch or the arrow keys pick a bar and read
 * it out as "Nov 11: 9 views" with the average under it; the same numbers
 * are in the table below. A bar with no value (`gap` says why) is left out.
 */
export function TrendChart({
  label,
  points,
  bucket = "day",
  bars,
  avg = null,
  unit = "count",
  noun,
  gap = "nothing to count",
  extra = [],
}: {
  label: string;
  points: TrendPoint[];
  /** What a bar is; it only decides which bars get a date under them. */
  bucket?: BarBucket;
  bars: BarSeries[];
  /** The 7-day average at each point (null: nothing to average). */
  avg?: (number | null)[] | null;
  unit?: "count" | "percent";
  /** What a bar counts, one and many: ["view", "views"]. */
  noun: [string, string];
  /** What a missing bar means, for its readout. */
  gap?: string;
  /** More rows for the readout and the table: plain counts, whatever the chart's unit. */
  extra?: { label: string; values: number[] }[];
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(null);
  const [at, setAt] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    setWidth(Math.round(el.getBoundingClientRect().width));
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const w = width ?? 720;
  const plotH = w < 480 ? 168 : 232;
  const n = points.length;
  const stacked = bars.length > 1;
  const show = (v: number | null) => (v === null ? "—" : unit === "percent" ? `${v}%` : v.toLocaleString("en-US", { maximumFractionDigits: 1 }));
  /** A point's bar: its series added up, or null when none of them has a value there. */
  const totals = points.map((_, i) => (bars.every((s) => s.values[i] == null) ? null : bars.reduce((t, s) => t + (s.values[i] ?? 0), 0)));
  const counted = (v: number | null) => (v === null ? gap : unit === "percent" ? `${v}% ${noun[1]}` : `${show(v)} ${v === 1 ? noun[0] : noun[1]}`);
  const max = Math.max(0, ...totals.map((v) => v ?? 0), ...(avg ?? []).map((v) => v ?? 0));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  const plotW = Math.max(1, w - LEFT - RIGHT);
  const band = plotW / Math.max(1, n);
  const barW = Math.max(1, Math.min(32, band - (band >= 8 ? Math.max(2, band * 0.25) : band >= 3 ? 1 : 0)));
  const x = (i: number) => LEFT + band * (i + 0.5);
  const y = (v: number) => TOP + plotH - (v / top) * plotH;

  /** A bar from `from` up to `to`, its top corners rounded when it is the top of its stack. */
  const bar = (i: number, from: number, to: number, round: boolean) => {
    const x0 = x(i) - barW / 2;
    const x1 = x0 + barW;
    const y0 = y(from);
    const y1 = y(to);
    const r = round ? Math.min(3, barW / 2, y0 - y1) : 0;
    return `M${x0.toFixed(1)},${y0.toFixed(1)}L${x0.toFixed(1)},${(y1 + r).toFixed(1)}Q${x0.toFixed(1)},${y1.toFixed(1)} ${(x0 + r).toFixed(1)},${y1.toFixed(1)}L${(x1 - r).toFixed(1)},${y1.toFixed(1)}Q${x1.toFixed(1)},${y1.toFixed(1)} ${x1.toFixed(1)},${(y1 + r).toFixed(1)}L${x1.toFixed(1)},${y0.toFixed(1)}Z`;
  };
  const marks = points.flatMap((p, i) => {
    let base = 0;
    const live = bars.filter((s) => (s.values[i] ?? 0) > 0);
    // A rate of 0% on a day with enough to divide by is a result, not a gap: a stub on the axis tells the two apart.
    if (unit === "percent" && totals[i] === 0) return [<rect key={`zero-${p.day}`} x={x(i) - barW / 2} y={y(0) - 2} width={barW} height={2} fill={bars[0].color} />];
    return live.map((s, k) => {
      const from = base;
      base += s.values[i] ?? 0;
      return <path key={`${s.key}-${p.day}`} d={bar(i, from, base, k === live.length - 1)} fill={s.color} />;
    });
  });

  /** Runs of consecutive points that have an average: a gap in the data is a gap in the line. */
  const runs: number[][] = [];
  let run: number[] = [];
  (avg ?? []).forEach((v, i) => {
    if (v === null) {
      if (run.length) runs.push(run);
      run = [];
    } else run.push(i);
  });
  if (run.length) runs.push(run);

  // As many dates as fit 64 px apart, counted back from the last bar; weekly steps when a bar is a day.
  const rawStep = Math.max(1, Math.ceil(64 / band));
  const step = bucket === "week" ? rawStep : rawStep > 1 && rawStep <= 7 ? 7 : rawStep > 7 ? Math.ceil(rawStep / 7) * 7 : 1;
  const xTicks = points.map((_, i) => i).filter((i) => (n - 1 - i) % step === 0);
  const edge = band < 44;

  const pick = (e: PointerEvent<HTMLDivElement>) => {
    if (n === 0) return;
    const r = e.currentTarget.getBoundingClientRect();
    setAt(Math.min(n - 1, Math.max(0, Math.floor((e.clientX - r.left - LEFT) / band))));
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, (i: number) => number> = { ArrowLeft: (i) => i - 1, ArrowRight: (i) => i + 1, Home: () => 0, End: () => n - 1 };
    if (e.key === "Escape") return setAt(null);
    const move = moves[e.key];
    if (!move || n === 0) return;
    e.preventDefault();
    setAt((i) => Math.min(n - 1, Math.max(0, move(i ?? n - 1))));
  };

  const hovered = at === null ? null : points[at];
  // A count chart with nothing in it says so; a rate chart with no bar at all says why (0% throughout is a result and is drawn).
  const empty = totals.every((v) => v === null) ? (n === 0 || unit === "count" ? "Nothing in this range yet." : `No bars to draw: ${gap} throughout.`) : unit === "count" && max === 0 ? "Nothing in this range yet." : null;
  const off = band / 2 + 8;
  const tipLeft = at === null ? 0 : Math.min(Math.max(0, x(at) + off + TIP_W > w ? x(at) - off - TIP_W : x(at) + off), Math.max(0, w - TIP_W));

  return (
    <div className="flex flex-col">
      <div
        ref={box}
        className="relative touch-pan-y rounded-md outline-offset-4 select-none"
        style={{ height: TOP + plotH + AXIS_H }}
        tabIndex={0}
        role="group"
        aria-label={`${label}, ${n} bars. Arrow keys step through them.`}
        onPointerMove={pick}
        onPointerDown={pick}
        onPointerLeave={(e) => e.pointerType === "mouse" && setAt(null)}
        onFocus={(e) => e.currentTarget.matches(":focus-visible") && setAt((i) => i ?? n - 1)}
        onBlur={() => setAt(null)}
        onKeyDown={onKey}
      >
        {width !== null && (
          <svg width={w} height={TOP + plotH + AXIS_H} className="block" aria-hidden>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={LEFT} x2={w - RIGHT} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--color-line)" : "var(--color-line-light)"} strokeWidth="1" shapeRendering="crispEdges" />
                <text x={LEFT - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" className="fill-ink-3 text-[11px] tabular-nums">
                  {unit === "percent" ? `${t}%` : t.toLocaleString("en-US")}
                </text>
              </g>
            ))}
            {hovered && at !== null && <rect x={x(at) - band / 2} y={TOP} width={band} height={plotH} fill="var(--color-line-light)" fillOpacity="0.7" />}
            {xTicks.map((i) => (
              <text key={i} x={edge && i === n - 1 ? w - RIGHT : edge && i === 0 ? LEFT : x(i)} y={TOP + plotH + 17} textAnchor={edge && i === n - 1 ? "end" : edge && i === 0 ? "start" : "middle"} className="fill-ink-3 text-[11px]">
                {points[i].tick}
              </text>
            ))}
            {marks}
            {runs.map((r) =>
              r.length === 1 ? (
                <circle key={r[0]} cx={x(r[0])} cy={y(avg?.[r[0]] ?? 0)} r="1.5" fill={LINE} />
              ) : (
                <path key={r[0]} d={r.map((i, k) => `${k ? "L" : "M"}${x(i).toFixed(1)},${y(avg?.[i] ?? 0).toFixed(1)}`).join("")} fill="none" stroke={LINE} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
              ),
            )}
            {at !== null && avg && avg[at] != null && <circle cx={x(at)} cy={y(avg[at] ?? 0)} r="3.5" fill={LINE} stroke="var(--color-paper)" strokeWidth="2" />}
          </svg>
        )}
        {width !== null && empty && <p className="absolute inset-x-0 top-1/3 px-4 text-center text-sm text-ink-3">{empty}</p>}
        {hovered && at !== null && (
          <div role="status" className="pointer-events-none absolute top-1 z-10 rounded-lg border border-line bg-paper px-3 py-2 text-[13px] shadow-lg" style={{ left: tipLeft, width: TIP_W }}>
            <div className="mb-0.5">
              <span className="text-ink-2">{hovered.when}: </span>
              <span className="font-bold tabular-nums">{counted(totals[at])}</span>
            </div>
            {stacked &&
              bars.map((s) => (
                <div key={s.key} className="flex items-center gap-2 text-ink-2">
                  <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: s.color }} aria-hidden />
                  <span className="tabular-nums">{show(s.values[at] ?? 0)}</span>
                  <span className="truncate">{s.label}</span>
                </div>
              ))}
            {extra.map((x2) => (
              <div key={x2.label} className="flex items-center gap-2 text-ink-3">
                <span className="tabular-nums">{(x2.values[at] ?? 0).toLocaleString("en-US")}</span>
                <span className="truncate">{x2.label}</span>
              </div>
            ))}
            {avg && (
              <div className="mt-1 flex items-center gap-2 border-t border-line-light pt-1 text-ink-2">
                <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: LINE }} aria-hidden />
                <span>
                  7-day avg: <span className="tabular-nums">{show(avg[at] ?? null)}</span>
                </span>
              </div>
            )}
          </div>
        )}
      </div>
      <details className="text-[13px]">
        <summary className="inline-flex min-h-11 list-none items-center text-ink-3 hover:text-lake md:min-h-8 [&::-webkit-details-marker]:hidden">Show as a table</summary>
        <div className="max-h-64 overflow-auto">
          <table className="w-full max-w-md">
            <thead className="sticky top-0 bg-paper text-left text-xs text-ink-3">
              <tr>
                <th className="py-1.5 pr-3 font-normal">When</th>
                {[...bars.map((s) => cap(s.label)), ...(avg ? ["7-day avg"] : []), ...extra.map((e) => cap(e.label))].map((h) => (
                  <th key={h} className="py-1.5 pl-3 text-right font-normal">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {points
                .map((p, i) => (
                  <tr key={p.day} className="border-t border-line-light">
                    <td className="py-1.5 pr-3">{p.when}</td>
                    {bars.map((s) => (
                      <td key={s.key} className="py-1.5 pl-3 text-right">
                        {show(s.values[i] ?? null)}
                      </td>
                    ))}
                    {avg && <td className="py-1.5 pl-3 text-right">{show(avg[i] ?? null)}</td>}
                    {extra.map((e) => (
                      <td key={e.label} className="py-1.5 pl-3 text-right">
                        {(e.values[i] ?? 0).toLocaleString("en-US")}
                      </td>
                    ))}
                  </tr>
                ))
                .reverse()}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
