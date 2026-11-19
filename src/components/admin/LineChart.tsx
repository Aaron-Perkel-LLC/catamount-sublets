"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { dayLabel, niceTicks } from "@/lib/chart";

export interface ChartSeries {
  key: string;
  label: string;
  /** A chart token from globals.css, e.g. var(--color-chart-lake). */
  color: string;
  /** A faint fill under this line (the first, biggest series reads best). */
  area?: boolean;
  /** Drawn dashed: for a series that isn't the same kind of count as the others. */
  dashed?: boolean;
}

export interface ChartPoint {
  /** "YYYY-MM-DD": the day, or the Monday of the week. */
  day: string;
  values: Record<string, number>;
}

const PLOT_H = 170;
const TOP = 10;
const AXIS_H = 26;
const LEFT = 34;
const RIGHT = 34;
/** The tooltip's fixed width, so it can be kept inside the chart without measuring it. */
const TIP_W = 196;

/**
 * The admin's line chart: lines on hairline gridlines, a legend, the last
 * bucket's values at the line ends, and a crosshair that snaps to a day (or
 * week) on hover, tap or the arrow keys. The same numbers are in the table
 * under it. Days are Eastern; the server buckets them.
 */
export function LineChart({ points, series, bucket, label }: { points: ChartPoint[]; series: ChartSeries[]; bucket: "day" | "week"; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [at, setAt] = useState<number | null>(null);

  // Drawn in pixels at the box's real width, so text stays text-sized at any width.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = points.length;
  const v = (p: ChartPoint, k: string) => p.values[k] ?? 0;
  const max = Math.max(0, ...points.flatMap((p) => series.map((s) => v(p, s.key))));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  const plotW = Math.max(1, width - LEFT - RIGHT);
  const x = (i: number) => LEFT + (n > 1 ? (i * plotW) / (n - 1) : plotW / 2);
  const y = (val: number) => TOP + PLOT_H - (val / top) * PLOT_H;
  const line = (k: string) => points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v(p, k)).toFixed(1)}`).join("");
  const area = (k: string) => (n ? `${line(k)}L${x(n - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z` : "");
  // Labels counted back from the last bucket, as far apart as there is room for "Oct 12".
  const step = bucket === "day" ? ((plotW / Math.max(1, n - 1)) * 7 < 52 ? 14 : 7) : Math.max(1, Math.ceil(52 / Math.max(1, plotW / Math.max(1, n - 1))));
  const xTicks = points.map((_, i) => i).filter((i) => (n - 1 - i) % step === 0);
  const last = points[n - 1];
  const endYs = last ? series.map((s) => y(v(last, s.key))).sort((a, b) => a - b) : [];
  const endLabels = Boolean(last) && endYs.every((yy, i) => i === 0 || yy - endYs[i - 1] >= 14);
  const when = (day: string) => (bucket === "week" ? `Week of ${dayLabel(day)}` : dayLabel(day, true));

  const pick = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left - LEFT) / plotW) * (n - 1));
    setAt(Math.min(n - 1, Math.max(0, i)));
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, (i: number) => number> = { ArrowLeft: (i) => i - 1, ArrowRight: (i) => i + 1, Home: () => 0, End: () => n - 1 };
    if (e.key === "Escape") return setAt(null);
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    setAt((i) => Math.min(n - 1, Math.max(0, move(i ?? n - 1))));
  };

  const hovered = at === null ? null : points[at];
  // Beside the crosshair, on whichever side has room, and never past either edge.
  const tipLeft = at === null ? 0 : Math.min(Math.max(0, x(at) + 12 + TIP_W > width ? x(at) - 12 - TIP_W : x(at) + 12), Math.max(0, width - TIP_W));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-2" aria-hidden>
        {series.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <Swatch color={s.color} dashed={s.dashed} />
            {s.label}
          </span>
        ))}
      </div>
      <div
        ref={box}
        className="relative touch-pan-y rounded-md outline-offset-4 select-none"
        tabIndex={0}
        role="group"
        aria-label={`${label}, ${n} ${bucket === "week" ? "weeks" : "days"}. Arrow keys step through them.`}
        onPointerMove={pick}
        onPointerDown={pick}
        onPointerLeave={(e) => e.pointerType === "mouse" && setAt(null)}
        onFocus={() => setAt((i) => i ?? n - 1)}
        onBlur={() => setAt(null)}
        onKeyDown={onKey}
      >
        <svg width={width} height={TOP + PLOT_H + AXIS_H} className="block" aria-hidden>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={LEFT} x2={width - RIGHT} y1={y(t)} y2={y(t)} stroke="var(--color-line)" strokeWidth="1" shapeRendering="crispEdges" />
              <text x={LEFT - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" className="fill-ink-3 text-[11px] tabular-nums">
                {t}
              </text>
            </g>
          ))}
          {xTicks.map((i) => (
            <text key={i} x={x(i)} y={TOP + PLOT_H + 17} textAnchor={i === n - 1 ? "end" : i === 0 && n > 1 ? "start" : "middle"} className="fill-ink-3 text-[11px]">
              {dayLabel(points[i].day)}
            </text>
          ))}
          {series
            .filter((s) => s.area)
            .map((s) => (
              <path key={`a-${s.key}`} d={area(s.key)} fill={s.color} fillOpacity="0.1" />
            ))}
          {series.map((s) => (
            <path key={s.key} d={line(s.key)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.dashed ? "5 4" : undefined} />
          ))}
          {endLabels &&
            series.map((s) => (
              <text key={s.key} x={x(n - 1) + 6} y={y(v(last, s.key))} dominantBaseline="middle" className="fill-ink-2 text-[11px] font-bold tabular-nums">
                {v(last, s.key)}
              </text>
            ))}
          {hovered && at !== null && (
            <g>
              <line x1={x(at)} x2={x(at)} y1={TOP} y2={y(0)} stroke="var(--color-ink-3)" strokeWidth="1" shapeRendering="crispEdges" />
              {series.map((s) => (
                <circle key={s.key} cx={x(at)} cy={y(v(hovered, s.key))} r="4" fill={s.color} stroke="var(--color-paper)" strokeWidth="2" />
              ))}
            </g>
          )}
        </svg>
        {max === 0 && <p className="absolute inset-x-0 top-1/3 text-center text-sm text-ink-3">Nothing in this range yet.</p>}
        {hovered && at !== null && (
          <div
            role="status"
            className="pointer-events-none absolute top-1 z-10 rounded-lg border border-line bg-paper px-3 py-2 text-sm whitespace-nowrap shadow-lg"
            style={{ left: tipLeft, width: TIP_W }}
          >
            <div className="text-xs text-ink-3">{when(hovered.day)}</div>
            {series.map((s) => (
              <div key={s.key} className="flex items-center gap-2">
                <Swatch color={s.color} dashed={s.dashed} width={12} />
                <span className="font-bold tabular-nums">{v(hovered, s.key)}</span>
                <span className="truncate text-ink-2">{s.label.toLowerCase()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-lake">The numbers by {bucket}</summary>
        <div className="mt-2 max-h-64 overflow-auto">
          <table className="w-full max-w-md">
            <thead className="sticky top-0 bg-paper text-left text-xs text-ink-3">
              <tr>
                <th className="py-1 pr-3 font-normal">{bucket === "week" ? "Week of" : "Day"}</th>
                {series.map((s) => (
                  <th key={s.key} className="pr-3 font-normal">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {[...points].reverse().map((p) => (
                <tr key={p.day} className="border-t border-line-light">
                  <td className="py-1 pr-3">{bucket === "week" ? dayLabel(p.day) : dayLabel(p.day, true)}</td>
                  {series.map((s) => (
                    <td key={s.key} className="pr-3">
                      {v(p, s.key)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function Swatch({ color, dashed, width = 14 }: { color: string; dashed?: boolean; width?: number }) {
  return (
    <svg width={width} height="2" className="shrink-0" aria-hidden>
      <line x1="0" y1="1" x2={width} y2="1" stroke={color} strokeWidth="2" strokeLinecap="round" strokeDasharray={dashed ? "4 3" : undefined} />
    </svg>
  );
}
