import { num } from "./ui";

const TONES = ["bg-chart-lake-soft", "bg-chart-lake"];

/**
 * Two parts of one whole as a thin bar, light to dark in one hue with a gap
 * between, and each part's number and name under its end so it reads
 * without hovering.
 */
export function SplitBar({ parts }: { parts: { label: string; n: number }[] }) {
  const total = parts.reduce((t, p) => t + p.n, 0);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex h-1 gap-0.5" aria-hidden>
        {total === 0 ? <span className="w-full rounded-full bg-line-light" /> : parts.map((p, i) => (p.n > 0 ? <span key={p.label} className={`rounded-full ${TONES[i % TONES.length]}`} style={{ flexGrow: p.n, flexBasis: 0 }} /> : null))}
      </div>
      <ul className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 text-[11px] leading-4 text-ink-3">
        {parts.map((p, i) => (
          <li key={p.label} className="inline-flex items-center gap-1 whitespace-nowrap">
            <span className={`h-1.5 w-1.5 rounded-full ${TONES[i % TONES.length]}`} aria-hidden />
            <span className="font-bold text-ink-2 tabular-nums">{num(p.n)}</span> {p.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
