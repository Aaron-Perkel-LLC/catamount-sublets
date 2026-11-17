import type { MetadataRoute } from "next";
import { SITE } from "@/config/site";

/**
 * The pages a search engine may list: the front page, sign-in, privacy, the
 * signed-out board and map, and each listing on the signed-out board. Kept
 * apart from src/app/sitemap.ts (which reads the database) so robots.test.ts
 * can check it without one.
 */
export function sitemapEntries(listings: readonly { id: number; updatedAt: Date }[]): MetadataRoute.Sitemap {
  return [
    { url: SITE.url, changeFrequency: "daily", priority: 1 },
    { url: `${SITE.url}/browse`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${SITE.url}/map`, changeFrequency: "hourly", priority: 0.6 },
    ...listings.map((l) => ({ url: `${SITE.url}/listing/${l.id}`, lastModified: l.updatedAt, changeFrequency: "daily" as const, priority: 0.7 })),
    { url: `${SITE.url}/sign-in`, changeFrequency: "yearly", priority: 0.5 },
    { url: `${SITE.url}/privacy`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
