import type { MetadataRoute } from "next";
import { getDb } from "@/db";
import { sitemapEntries } from "@/lib/sitemap";
import { publicSitemapEntries } from "@/server/data/public-listings";
import { log } from "@/server/log";

/** Read live, so a listing kept to signed-in students (or taken down) drops out at once. */
export const dynamic = "force-dynamic";

/** See src/lib/sitemap.ts. Listings come only from the signed-out board; a database outage leaves just the fixed pages. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let listings: { id: number; updatedAt: Date }[] = [];
  try {
    listings = await publicSitemapEntries(await getDb());
  } catch (error) {
    log.error("sitemap.listings_failed", error);
  }
  return sitemapEntries(listings);
}
