import { Empty } from "./Card";
import { num, NUM, ZERO } from "./ui";

/** Counts as rows with a thin bar under each, as long as the row's share of the biggest. `pct` adds the share after the count. */
export function BarList({ rows, empty = "Nothing yet." }: { rows: { label: string; n: number; pct?: number }[]; empty?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  if (rows.length === 0) return <Empty>{empty}</Empty>;
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <li key={r.label} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="leading-snug text-ink-2">{r.label}</span>
            <span className="shrink-0">
              <span className={r.n === 0 ? ZERO : NUM}>{num(r.n)}</span>
              {r.pct !== undefined && <span className="ml-1.5 text-xs text-ink-3 tabular-nums">{r.pct}%</span>}
            </span>
          </div>
          <div className="h-1 rounded-full bg-line-light">
            <div className="h-full rounded-full bg-chart-lake" style={{ width: `${(r.n / max) * 100}%`, minWidth: r.n > 0 ? 3 : 0 }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
