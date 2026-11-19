import type { Chip } from "@/lib/admin-delta";

/** ▲/▼ and a percentage in the good or bad tint, or the plain difference in grey (src/lib/admin-delta.ts decides which). */
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
