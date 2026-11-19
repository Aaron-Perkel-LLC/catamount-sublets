import type { useRouter } from "next/navigation";

/**
 * Goes to an admin URL. When only the hash differs from where we are, it sets
 * the hash itself (and announces it when it is already that hash): Next's
 * router updates the URL without a hashchange, and the sections listen for
 * hashchange (#people:<id>, #images:<id>, #post:<id>). The page's own query
 * (?q=, ?range=) stays as it is.
 */
export function goAdmin(router: ReturnType<typeof useRouter>, url: string): void {
  const u = new URL(url, window.location.href);
  if (u.pathname === window.location.pathname && u.hash) {
    if (window.location.hash === u.hash) window.dispatchEvent(new HashChangeEvent("hashchange"));
    else window.location.hash = u.hash;
    return;
  }
  router.push(u.pathname + u.search + u.hash);
}
