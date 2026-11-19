"use client";

import { type KeyboardEvent, type PointerEvent, useLayoutEffect, useRef, useState } from "react";
import type { TrendPoint } from "@/lib/admin-trend";
import { niceTicks } from "@/lib/chart";

export interface TrendSeries {
  key: string;
  label: string;
  /** A chart token, e.g. var(--color-chart-lake). */
  color: string;
  kind: "area" | "line";
  values: (number | null)[];
}

const TOP = 8;
const AXIS_H = 24;
const LEFT = 36;
const RIGHT = 8;
const TIP_W = 184;

/**
 * The admin's one chart: soft areas and lines on hairline gridlines with one
 * y-axis (series share a unit, or they are separate charts). A crosshair snaps to the nearest point on
 * hover, touch or the arrow keys and reads out every series there; the same
 * numbers are in the table under it.
 */
export function TrendChart({ label, points, series, unit = "count", extra = [] }: { label: string; points: TrendPoint[]; series: TrendSeries[]; unit?: "count" | "percent"; extra?: { label: string; values: number[] }[] }) {
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
  const show = (v: number | null) => (v === null ? "—" : unit === "percent" ? `${v}%` : v.toLocaleString("en-US"));
  const max = Math.max(0, ...series.flatMap((s) => s.values.map((v) => v ?? 0)));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  const plotW = Math.max(1, w - LEFT - RIGHT);
  const x = (i: number) => LEFT + (n > 1 ? (i * plotW) / (n - 1) : plotW / 2);
  const y = (v: number) => TOP + plotH - (v / top) * plotH;

  /** Runs of consecutive points that have a value: a gap in the data is a gap in the line. */
  const runs = (values: (number | null)[]) => {
    const out: number[][] = [];
    let run: number[] = [];
    values.forEach((v, i) => {
      if (v === null) {
        if (run.length) out.push(run);
        run = [];
      } else run.push(i);
    });
    if (run.length) out.push(run);
    return out;
  };
  const path = (values: (number | null)[], run: number[]) => run.map((i, k) => `${k ? "L" : "M"}${x(i).toFixed(1)},${y(values[i] ?? 0).toFixed(1)}`).join("");

  // As many dates as fit 64 px apart, counted back from the last point; weekly steps when a point is a day.
  const dx = plotW / Math.max(1, n - 1);
  const rawStep = Math.max(1, Math.ceil(64 / dx));
  const step = rawStep > 1 && rawStep <= 7 ? 7 : rawStep > 7 ? Math.ceil(rawStep / 7) * 7 : 1;
  const xTicks = points.map((_, i) => i).filter((i) => (n - 1 - i) % step === 0);

  const pick = (e: PointerEvent<HTMLDivElement>) => {
    if (n === 0) return;
    const r = e.currentTarget.getBoundingClientRect();
    const i = n > 1 ? Math.round(((e.clientX - r.left - LEFT) / plotW) * (n - 1)) : 0;
    setAt(Math.min(n - 1, Math.max(0, i)));
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
  const tipLeft = at === null ? 0 : Math.min(Math.max(0, x(at) + 12 + TIP_W > w ? x(at) - 12 - TIP_W : x(at) + 12), Math.max(0, w - TIP_W));

  return (
    <div className="flex flex-col">
      <div
        ref={box}
        className="relative touch-pan-y rounded-md outline-offset-4 select-none"
        style={{ height: TOP + plotH + AXIS_H }}
        tabIndex={0}
        role="group"
        aria-label={`${label}, ${n} points. Arrow keys step through them.`}
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
            {xTicks.map((i) => (
              <text key={i} x={x(i)} y={TOP + plotH + 17} textAnchor={i === n - 1 ? "end" : i === 0 && n > 1 ? "start" : "middle"} className="fill-ink-3 text-[11px]">
                {points[i].tick}
              </text>
            ))}
            {series
              .filter((s) => s.kind === "area")
              .flatMap((s) => runs(s.values).map((run) => <path key={`a-${s.key}-${run[0]}`} d={`${path(s.values, run)}L${x(run[run.length - 1]).toFixed(1)},${y(0)}L${x(run[0]).toFixed(1)},${y(0)}Z`} fill={s.color} fillOpacity="0.1" />))}
            {series.flatMap((s) =>
              runs(s.values).map((run) =>
                run.length === 1 ? (
                  <circle key={`${s.key}-${run[0]}`} cx={x(run[0])} cy={y(s.values[run[0]] ?? 0)} r="2" fill={s.color} />
                ) : (
                  <path key={`${s.key}-${run[0]}`} d={path(s.values, run)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                ),
              ),
            )}
            {hovered && at !== null && (
              <g>
                <line x1={x(at)} x2={x(at)} y1={TOP} y2={y(0)} stroke="var(--color-ink-3)" strokeWidth="1" shapeRendering="crispEdges" />
                {series.map((s) => (s.values[at] === null ? null : <circle key={s.key} cx={x(at)} cy={y(s.values[at] ?? 0)} r="4" fill={s.color} stroke="var(--color-paper)" strokeWidth="2" />))}
              </g>
            )}
          </svg>
        )}
        {width !== null && max === 0 && <p className="absolute inset-x-0 top-1/3 text-center text-sm text-ink-3">Nothing in this range yet.</p>}
        {hovered && at !== null && (
          <div role="status" className="pointer-events-none absolute top-1 z-10 rounded-lg border border-line bg-paper px-3 py-2 text-[13px] shadow-lg" style={{ left: tipLeft, width: TIP_W }}>
            <div className="mb-1 text-xs text-ink-3">{hovered.when}</div>
            {series.map((s) => (
              <div key={s.key} className="flex items-center gap-2">
                <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: s.color }} aria-hidden />
                <span className="font-bold tabular-nums">{show(s.values[at])}</span>
                <span className="truncate text-ink-2">{s.label}</span>
              </div>
            ))}
            {extra.map((x2) => (
              <div key={x2.label} className="flex items-center gap-2 text-ink-3">
                <span className="w-3 shrink-0" aria-hidden />
                <span className="tabular-nums">{show(x2.values[at] ?? 0)}</span>
                <span className="truncate">{x2.label}</span>
              </div>
            ))}
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
                {[...series.map((s) => s.label), ...extra.map((e) => e.label)].map((h) => (
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
                    {series.map((s) => (
                      <td key={s.key} className="py-1.5 pl-3 text-right">
                        {show(s.values[i])}
                      </td>
                    ))}
                    {extra.map((e) => (
                      <td key={e.label} className="py-1.5 pl-3 text-right">
                        {show(e.values[i] ?? 0)}
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
