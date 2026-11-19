import { sparkWorthDrawing } from "@/lib/admin-trend";

/**
 * A number's shape over the range: no axis and no labels, the number beside
 * it says how much. With too little to show a shape (src/lib/admin-trend.ts)
 * it is a faint baseline instead of a flat line and a spike.
 */
export function Sparkline({ values, className = "h-9 w-full" }: { values: readonly (number | null)[]; className?: string }) {
  const v = values.map((x) => x ?? 0);
  const n = v.length;
  if (n < 2 || !sparkWorthDrawing(values)) {
    return (
      <div className={`flex items-end ${className}`} aria-hidden>
        <div className="h-px w-full bg-line" />
      </div>
    );
  }
  const max = Math.max(1, ...v);
  const x = (i: number) => (i / (n - 1)) * 100;
  const y = (val: number) => 26 - (val / max) * 24;
  const line = v.map((val, i) => `${i ? "L" : "M"}${x(i).toFixed(2)},${y(val).toFixed(2)}`).join("");
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" className={className} aria-hidden>
      <path d={`${line}L100,28L0,28Z`} fill="var(--color-chart-lake)" fillOpacity="0.1" />
      <path d={line} fill="none" stroke="var(--color-chart-lake)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
