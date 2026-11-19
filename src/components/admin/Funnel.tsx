import { num, ZERO } from "./ui";

/**
 * Steps side by side, each a count over a bar as long as its share of the
 * biggest; stacked as rows on a phone. Each step is its own count, so no
 * step-to-step percentage is drawn.
 */
export function Funnel({ steps }: { steps: { label: string; n: number; tip?: string }[] }) {
  const max = Math.max(1, ...steps.map((s) => s.n));
  return (
    <ol className="grid gap-x-3 gap-y-3 sm:grid-cols-5">
      {steps.map((s, i) => (
        <li key={s.label} className="flex min-w-0 flex-col gap-1.5" title={s.tip}>
          <div className="flex items-baseline justify-between gap-2 sm:flex-col sm:gap-0.5">
            <span className="truncate text-xs text-ink-3">
              <span className="tabular-nums">{i + 1}</span> {s.label}
            </span>
            <span className={`text-lg leading-6 ${s.n === 0 ? ZERO : "font-bold tabular-nums"}`}>{num(s.n)}</span>
          </div>
          <div className="h-1.5 rounded-full bg-line-light">
            <div className="h-full rounded-full bg-chart-lake" style={{ width: `${(s.n / max) * 100}%`, minWidth: s.n > 0 ? 4 : 0 }} />
          </div>
        </li>
      ))}
    </ol>
  );
}
