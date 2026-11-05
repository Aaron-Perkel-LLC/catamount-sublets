"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { dayLabel, niceTicks } from "@/lib/chart";

export interface DailyPoint {
  day: string;
  views: number;
  contacts: number;
}

/** Two series on one axis: both are people per day. Colours are the chart tokens in globals.css. */
const SERIES = [
  { key: "views", label: "People viewing", color: "var(--color-chart-lake)" },
  { key: "contacts", label: "Got in touch", color: "var(--color-chart-maple)" },
] as const;

const PLOT_H = 170;
const TOP = 10;
const AXIS_H = 26;
const LEFT = 34;
const RIGHT = 34;
/** The tooltip's fixed width, so it can be kept inside the chart without measuring it. */
const TIP_W = 176;

/**
 * The Activity tab's daily chart: lines on hairline gridlines, a legend, the
 * last day's values at the line ends, and a crosshair that snaps to a day on
 * hover, tap or the arrow keys. The same numbers are in the table under it.
 */
export function DailyChart({ days }: { days: DailyPoint[] }) {
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

  const n = days.length;
  const max = Math.max(0, ...days.map((d) => Math.max(d.views, d.contacts)));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  const plotW = Math.max(1, width - LEFT - RIGHT);
  const x = (i: number) => LEFT + (n > 1 ? (i * plotW) / (n - 1) : plotW / 2);
  const y = (v: number) => TOP + PLOT_H - (v / top) * PLOT_H;
  const line = (k: "views" | "contacts") => days.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d[k]).toFixed(1)}`).join("");
  const area = n ? `${line("views")}L${x(n - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z` : "";
  // Weekly labels counted back from today; fortnightly when a week is too narrow for "Oct 12".
  const every = (plotW / Math.max(1, n - 1)) * 7 < 52 ? 14 : 7;
  const xTicks = days.map((_, i) => i).filter((i) => (n - 1 - i) % every === 0);
  const last = days[n - 1];
  const endLabels = last && Math.abs(y(last.views) - y(last.contacts)) >= 14;

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

  const hovered = at === null ? null : days[at];
  // Beside the crosshair, on whichever side has room, and never past either edge.
  const tipLeft = at === null ? 0 : Math.min(Math.max(0, x(at) + 12 + TIP_W > width ? x(at) - 12 - TIP_W : x(at) + 12), Math.max(0, width - TIP_W));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-2" aria-hidden>
        {SERIES.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <svg width="14" height="2" className="shrink-0">
              <line x1="0" y1="1" x2="14" y2="1" stroke={s.color} strokeWidth="2" strokeLinecap="round" />
            </svg>
            {s.label}
          </span>
        ))}
      </div>
      <div
        ref={box}
        className="relative touch-pan-y rounded-md outline-offset-4 select-none"
        tabIndex={0}
        role="group"
        aria-label={`Daily activity, ${n} days. Arrow keys step through the days.`}
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
            <text key={i} x={x(i)} y={TOP + PLOT_H + 17} textAnchor={i === n - 1 ? "end" : "middle"} className="fill-ink-3 text-[11px]">
              {dayLabel(days[i].day)}
            </text>
          ))}
          <path d={area} fill="var(--color-chart-lake)" fillOpacity="0.1" />
          {SERIES.map((s) => (
            <path key={s.key} d={line(s.key)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {endLabels &&
            SERIES.map((s) => (
              <text key={s.key} x={x(n - 1) + 6} y={y(last[s.key])} dominantBaseline="middle" className="fill-ink-2 text-[11px] font-bold tabular-nums">
                {last[s.key]}
              </text>
            ))}
          {hovered && at !== null && (
            <g>
              <line x1={x(at)} x2={x(at)} y1={TOP} y2={y(0)} stroke="var(--color-ink-3)" strokeWidth="1" shapeRendering="crispEdges" />
              {SERIES.map((s) => (
                <circle key={s.key} cx={x(at)} cy={y(hovered[s.key])} r="4" fill={s.color} stroke="var(--color-paper)" strokeWidth="2" />
              ))}
            </g>
          )}
        </svg>
        {max === 0 && <p className="absolute inset-x-0 top-1/3 text-center text-sm text-ink-3">Nothing in this window yet.</p>}
        {hovered && at !== null && (
          <div
            role="status"
            className="pointer-events-none absolute top-1 z-10 rounded-lg border border-line bg-paper px-3 py-2 text-sm whitespace-nowrap shadow-lg"
            style={{ left: tipLeft, width: TIP_W }}
          >
            <div className="text-xs text-ink-3">{dayLabel(hovered.day, true)}</div>
            {SERIES.map((s) => (
              <div key={s.key} className="flex items-center gap-2">
                <svg width="12" height="2" className="shrink-0" aria-hidden>
                  <line x1="0" y1="1" x2="12" y2="1" stroke={s.color} strokeWidth="2" strokeLinecap="round" />
                </svg>
                <span className="font-bold tabular-nums">{hovered[s.key]}</span>
                <span className="text-ink-2">{s.label.toLowerCase()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-lake">The numbers by day</summary>
        <div className="mt-2 max-h-64 overflow-y-auto">
          <table className="w-full max-w-sm">
            <thead className="sticky top-0 bg-paper text-left text-xs text-ink-3">
              <tr>
                <th className="py-1 font-normal">Day</th>
                <th className="font-normal">Viewing</th>
                <th className="font-normal">Got in touch</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {[...days].reverse().map((d) => (
                <tr key={d.day} className="border-t border-line-light">
                  <td className="py-1">{dayLabel(d.day, true)}</td>
                  <td>{d.views}</td>
                  <td>{d.contacts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
