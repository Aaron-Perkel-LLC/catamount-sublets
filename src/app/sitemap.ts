import type { MetadataRoute } from "next";
import { SITE } from "@/config/site";

/**
 * The pages a search engine may list: the front page, sign-in and privacy.
 * Everything else is behind sign-in or is a share link (noindex).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE.url, changeFrequency: "daily", priority: 1 },
    { url: `${SITE.url}/sign-in`, changeFrequency: "yearly", priority: 0.5 },
    { url: `${SITE.url}/privacy`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
