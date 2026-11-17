import { NextResponse, type NextRequest } from "next/server";

/**
 * Two jobs on every page request:
 *
 * 1. A Content-Security-Policy with a per-request nonce. Next.js reads the
 *    nonce from this header and stamps it on its own inline scripts. No CDN
 *    scripts are loaded anywhere (MapLibre is bundled, icons are inline SVG),
 *    so script-src is 'self' plus the nonce. MapLibre needs blob: workers and
 *    inline styles, heic2any's libheif needs wasm-unsafe-eval; photos come
 *    from the Blob store; tiles from OpenFreeMap
 *    with the Esri fallback.
 *
 * 2. An optimistic gate for the signed-in area: no session cookie at all means
 *    a redirect to sign-in without touching the database. The real check is
 *    src/app/(app)/layout.tsx, which validates the session on every request.
 *
 * 3. The board (/browse, /map, /listing/…) is open to signed-out visitors and
 *    renders differently with a session, so no cache between here and the
 *    browser may keep one render and hand it to someone else: private,
 *    no-store, and Vary: Cookie for anything that ignores no-store.
 */
const PROTECTED = ["/post", "/account", "/admin", "/welcome"];
const BOARD = ["/browse", "/map", "/listing"];
const under = (pathname: string, roots: readonly string[]) => roots.some((p) => pathname === p || pathname.startsWith(`${p}/`));
const COOKIE_NAMES = ["__Secure-catamount.session_token", "catamount.session_token"];

function csp(nonce: string): string {
  const dev = process.env.NODE_ENV !== "production";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data: https://*.public.blob.vercel-storage.com https://tiles.openfreemap.org https://server.arcgisonline.com",
    "font-src 'self' data:",
    // The Blob client uploads raw photos straight to vercel.com/api/blob, not to the store's own host.
    "connect-src 'self' https://tiles.openfreemap.org https://server.arcgisonline.com https://*.vercel-storage.com https://vercel.com/api/blob/ https://vercel.live",
    "worker-src 'self' blob:",
    "child-src 'self' blob:",
    "frame-ancestors 'self'",
    "form-action 'self' mailto: sms: tel:",
    "base-uri 'self'",
    "object-src 'none'",
    dev ? "" : "upgrade-insecure-requests",
  ]
    .filter(Boolean)
    .join("; ");
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (under(pathname, PROTECTED) && !COOKIE_NAMES.some((name) => request.cookies.has(name))) {
    const signIn = new URL("/sign-in", request.url);
    signIn.searchParams.set("next", pathname + search);
    return NextResponse.redirect(signIn);
  }

  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64");
  const policy = csp(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("x-pathname", pathname + search); // the app layout's welcome gate sends people back here
  requestHeaders.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  if (under(pathname, BOARD)) {
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    response.headers.set("Vary", "Cookie");
  }
  return response;
}

export const config = {
  // Every page; not static assets, the image optimiser, or the share-card and API routes (no HTML there).
  matcher: ["/((?!_next/static|_next/image|api/|share-card/|dev-uploads/|seed/|.*\\.(?:png|svg|ico|webp|jpg|txt|mjs)$).*)"],
};
