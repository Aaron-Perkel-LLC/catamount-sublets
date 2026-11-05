/**
 * Whether `href` is the page being shown: the path itself or anything under
 * it (/admin/…), and a single listing (/listing/187) counts as Browse.
 */
export function isCurrent(pathname: string, href: string): boolean {
  const base = href.split("?")[0];
  if (base === "/browse" && pathname.startsWith("/listing/")) return true;
  return pathname === base || pathname.startsWith(`${base}/`);
}
