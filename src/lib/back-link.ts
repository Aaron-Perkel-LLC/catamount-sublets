/**
 * The top "← site" link on pages the footer opens (What's new, Privacy):
 * the footer link carries the page it was clicked on as `?from=`, and the
 * page links back there, so leaving the map for What's new comes back to the
 * map with its filters. Only a path on this site is accepted; anything else
 * (another origin, `//host`, `/\host`, a scheme) goes to the front page.
 */
const MAX_FROM = 512;

export function backHref(from: string | string[] | undefined): string {
  if (typeof from !== "string" || from.length > MAX_FROM) return "/";
  if (!from.startsWith("/") || from.startsWith("//") || from.startsWith("/\\")) return "/";
  // Control characters (tabs, newlines) are stripped by URL parsers, which can turn "/\t/host" into "//host".
  if (/[\u0000-\u001f\u007f]/.test(from)) return "/";
  return from;
}

/** `href` with `?from=` the current page, unless that's the front page (the default) or `href` itself. */
export function withFrom(href: string, pathname: string, search: string): string {
  if (pathname === "/" || pathname === href) return href;
  const from = search ? `${pathname}?${search}` : pathname;
  if (backHref(from) !== from) return href;
  return `${href}?${new URLSearchParams({ from })}`;
}
