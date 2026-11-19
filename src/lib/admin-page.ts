export type AdminSearchParams = Promise<Record<string, string | string[] | undefined>>;

/** A search param as one string (the first, if repeated). */
export function param(p: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const v = p[key];
  return Array.isArray(v) ? v[0] : v;
}
