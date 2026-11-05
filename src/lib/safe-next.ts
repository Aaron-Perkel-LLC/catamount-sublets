/**
 * A `next` parameter is only ever a path on this site: it must start with a
 * single slash. Anything else (an absolute URL, `//evil`, a scheme) falls
 * back to the default, so sign-in can never be used as an open redirect.
 */
export function safeNext(value: string | null | undefined, fallback = "/browse"): string {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\s]/.test(value)) return fallback;
  return value;
}
