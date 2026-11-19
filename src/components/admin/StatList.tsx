import type { Chip } from "@/lib/admin-delta";
import { DeltaChip } from "./DeltaChip";
import { Tip } from "./Tip";
import { GROUP, NUM, ZERO } from "./ui";

export interface Stat {
  label: string;
  /** Already formatted. */
  value: string;
  /** A nought: drawn muted. */
  zero?: boolean;
  chip?: Chip | null;
  tip?: string;
}

export interface StatGroup {
  title: string;
  stats: Stat[];
}

/** Secondary numbers as compact rows under small group headers: label, change, number. No card each, no sentence each. */
export function StatList({ groups }: { groups: StatGroup[] }) {
  return (
    <div className="flex flex-col">
      {groups.map((g, gi) => (
        <div key={g.title} className={gi > 0 ? "mt-2 border-t border-line-light pt-2" : ""}>
          <h3 className={`${GROUP} px-4 py-1.5`}>{g.title}</h3>
          <ul>
            {g.stats.map((s) => (
              <li key={s.label} className="flex min-h-9 items-center justify-between gap-2 px-4">
                {s.tip ? (
                  <Tip text={s.tip} quiet className="text-[13px] text-ink-2">
                    {s.label}
                  </Tip>
                ) : (
                  <span className="text-[13px] text-ink-2">{s.label}</span>
                )}
                <span className="flex items-center gap-2">
                  <DeltaChip chip={s.chip} />
                  <span className={`min-w-6 text-right text-sm ${s.zero ? ZERO : NUM}`}>{s.value}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
