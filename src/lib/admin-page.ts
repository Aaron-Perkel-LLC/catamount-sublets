import type { RangeDto } from "@/components/admin/RangePicker";
import type { ResolvedRange } from "./admin-range";

/** What the range picker needs from a resolved range (plain strings, for a client component). */
export function rangeDto(r: ResolvedRange): RangeDto {
  return { key: r.key, label: r.label, from: r.from, to: r.to, prev: r.prev ? { from: r.prev.from, to: r.prev.to } : null };
}

export type AdminSearchParams = Promise<Record<string, string | string[] | undefined>>;

/** A search param as one string (the first, if repeated). */
export function param(p: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const v = p[key];
  return Array.isArray(v) ? v[0] : v;
}
