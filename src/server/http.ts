/**
 * Cross-site request check for mutating Route Handlers (Server Actions get
 * the same from Next.js). Sec-Fetch-Site states the relationship directly
 * and every current browser sends it; Origin/Referer is the fallback. A
 * request carrying none of the three is not a browser cross-site POST.
 */
export function sameOrigin(request: Request): boolean {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite) return fetchSite === "same-origin" || fetchSite === "none";
  const source = request.headers.get("origin") ?? request.headers.get("referer");
  if (!source) return true;
  try {
    return new URL(source).host.toLowerCase() === (request.headers.get("host") ?? "").toLowerCase();
  } catch {
    return false;
  }
}

/** The caller's IP for rate limiting, as Vercel reports it. */
export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}
