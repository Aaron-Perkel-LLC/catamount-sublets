import Link from "next/link";
import type { Chip } from "./model";

/** ▲/▼ and a percentage in the good or bad tint, or the plain difference in grey. */
export function DeltaChip({ chip }: { chip: Chip | null | undefined }) {
  if (!chip) return null;
  const tone = chip.tone === "good" ? "bg-included-tint text-included-ink" : chip.tone === "bad" ? "bg-error-tint text-maple-ink" : "bg-line-light text-ink-2";
  return (
    <span title={chip.words} className={`inline-flex h-5 shrink-0 items-center rounded-md px-1.5 text-xs font-bold whitespace-nowrap tabular-nums ${tone}`}>
      <span aria-hidden>{chip.text}</span>
      <span className="sr-only">{chip.words}</span>
    </span>
  );
}

/** A number's shape over the range: no axis, no labels, the card's own number says how much. */
export function Sparkline({ values, className = "h-8 w-full" }: { values: (number | null)[]; className?: string }) {
  const v = values.map((x) => x ?? 0);
  const max = Math.max(1, ...v);
  const n = v.length;
  const x = (i: number) => (n > 1 ? (i / (n - 1)) * 100 : 50);
  const y = (val: number) => 26 - (val / max) * 24;
  const line = v.map((val, i) => `${i ? "L" : "M"}${x(i).toFixed(2)},${y(val).toFixed(2)}`).join("");
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" className={className} aria-hidden>
      {n > 1 && <path d={`${line}L100,28L0,28Z`} fill="var(--color-chart-lake)" fillOpacity="0.1" />}
      {n > 1 && <path d={line} fill="none" stroke="var(--color-chart-lake)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
    </svg>
  );
}

/** Parts of one whole as a thin bar: light to dark in one hue, a gap between. */
export function SplitBar({ parts }: { parts: { label: string; n: number }[] }) {
  const total = parts.reduce((t, p) => t + p.n, 0);
  const tones = ["bg-chart-lake-soft", "bg-chart-lake"];
  if (total === 0) return <div className="h-1 rounded-full bg-line-light" aria-hidden />;
  return (
    <div className="flex h-1 gap-0.5" role="img" aria-label={parts.map((p) => `${p.label} ${p.n}`).join(", ")} title={parts.map((p) => `${p.label} ${p.n.toLocaleString("en-US")}`).join(" · ")}>
      {parts.map((p, i) => (p.n > 0 ? <span key={p.label} className={`rounded-full ${tones[i % tones.length]}`} style={{ flexGrow: p.n, flexBasis: 0 }} /> : null))}
    </div>
  );
}

const RANGES = [
  { key: "7d", label: "7d" },
  { key: "30d", label: "30d" },
  { key: "semester", label: "Semester" },
  { key: "cutover", label: "Cutover" },
  { key: "all", label: "All" },
] as const;

/**
 * The date range as one compact segmented control. Plain links and a GET
 * form, so it works before any script loads; Custom opens two date fields.
 */
export function RangeControl({ base, range, tone = "line" }: { base: string; range: { key: string; from: string; to: string }; tone?: "line" | "sunk" }) {
  const seg = (on: boolean) =>
    `inline-flex h-11 flex-auto items-center justify-center rounded-md px-1.5 text-[13px] whitespace-nowrap md:h-7 md:flex-none md:px-2.5 ${on ? "bg-lake font-bold text-paper" : "text-ink-2 hover:bg-line-light hover:text-ink"}`;
  return (
    <div className={`relative flex items-center gap-0.5 rounded-lg p-0.5 ${tone === "line" ? "border border-line bg-paper" : "bg-line-light/80"}`} role="group" aria-label="Date range">
      {RANGES.map((r) => (
        <Link key={r.key} href={`${base}?range=${r.key}`} scroll={false} aria-current={range.key === r.key ? "true" : undefined} className={seg(range.key === r.key)}>
          {r.label}
        </Link>
      ))}
      <details className="group flex flex-auto md:flex-none">
        <summary className={`${seg(range.key === "custom")} w-full list-none [&::-webkit-details-marker]:hidden`}>Custom</summary>
        <form method="get" action={base} className="absolute top-full right-0 z-30 mt-2 flex w-72 max-w-[calc(100vw-2rem)] flex-col gap-3 rounded-xl border border-line bg-paper p-4 shadow-lg">
          <input type="hidden" name="range" value="custom" />
          <label className="flex flex-col gap-1 text-xs text-ink-3">
            From
            <input type="date" name="from" defaultValue={range.from} required className="h-11 rounded-lg border border-line bg-paper px-3 text-ink" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-3">
            To
            <input type="date" name="to" defaultValue={range.to} required className="h-11 rounded-lg border border-line bg-paper px-3 text-ink" />
          </label>
          <button type="submit" className="h-11 rounded-lg bg-lake text-sm font-bold text-paper hover:bg-lake-deep">
            Apply
          </button>
        </form>
      </details>
    </div>
  );
}
