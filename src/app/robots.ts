import type { MetadataRoute } from "next";
import { SITE } from "@/config/site";

/**
 * Search engines may list the front page, sign-in and privacy (see
 * sitemap.ts). The signed-in area is disallowed: it only redirects to
 * sign-in. Share links, share cards and the request form are deliberately
 * *not* disallowed: they carry noindex (meta tag or X-Robots-Tag), and a
 * crawler that is kept out never sees it, so a link posted somewhere public
 * could still be listed by its bare URL. Link-preview scrapers ignore this
 * file either way.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: ["/browse", "/map", "/post", "/account", "/admin", "/listing/", "/welcome", "/api/"] },
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
