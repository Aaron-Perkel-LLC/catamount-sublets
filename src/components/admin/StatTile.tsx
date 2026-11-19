import { deltaText } from "@/lib/admin-delta";

/** One number on a tile, with the change against the previous equal period under it when there is one. */
export function StatTile({ label, value, prev, sub, title }: { label: string; value: number | string; prev?: number | null; sub?: string; title?: string }) {
  const delta = typeof value === "number" && prev !== undefined ? deltaText(value, prev) : null;
  return (
    <div className="flex min-w-0 flex-col rounded-lg border border-line bg-paper px-3 py-2" title={title}>
      <div className="truncate text-xs text-ink-3">{label}</div>
      <div className="text-xl font-bold tabular-nums">{value}</div>
      {(delta || sub) && (
        <div className="text-xs text-ink-3 tabular-nums">
          {delta && <span>{delta} vs before</span>}
          {delta && sub && " · "}
          {sub}
        </div>
      )}
    </div>
  );
}
