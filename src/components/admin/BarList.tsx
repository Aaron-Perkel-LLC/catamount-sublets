/** A titled list of counts with a bar each; `pct` adds the share after the count. `wide` gives long labels room. */
export function BarList({ title, rows, wide = false, empty = "Nothing yet." }: { title: string; rows: { label: string; n: number; pct?: number }[]; wide?: boolean; empty?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <section className="rounded-xl border border-line bg-paper p-4 text-sm">
      <h3 className="mb-2 font-bold">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-ink-3">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {rows.map((r) => (
            <li key={r.label} className={`grid items-center gap-2 ${wide ? "grid-cols-[9rem_1fr] sm:grid-cols-[14rem_1fr]" : "grid-cols-[6.5rem_1fr]"}`}>
              {/* Wide lists carry whole sentences, so they wrap; the short ones truncate as before. */}
              <span className={wide ? "leading-snug text-ink-2" : "truncate text-ink-2"}>{r.label}</span>
              <span className="flex items-center gap-2">
                <span className="h-3 rounded-r bg-chart-lake" style={{ width: `${(r.n / max) * 100}%`, minWidth: 2 }} aria-hidden />
                <span className="font-bold tabular-nums">{r.n}</span>
                {r.pct !== undefined && <span className="text-xs tabular-nums text-ink-3">{r.pct}%</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
