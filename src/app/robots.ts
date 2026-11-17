import type { MetadataRoute } from "next";
import { SITE } from "@/config/site";

/**
 * Search engines may list the front page, sign-in, privacy, and the
 * signed-out board, map and listings (see src/lib/sitemap.ts). The
 * signed-in-only pages are disallowed: they only redirect to sign-in. Share
 * links, share cards and the request form are deliberately *not*
 * disallowed: they carry noindex (meta tag or X-Robots-Tag), and a crawler
 * that is kept out never sees it, so a link posted somewhere public could
 * still be listed by its bare URL. Link-preview scrapers ignore this file
 * either way.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: ["/post", "/account", "/admin", "/welcome", "/api/"] },
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
