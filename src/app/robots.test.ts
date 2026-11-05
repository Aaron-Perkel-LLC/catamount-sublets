import { describe, expect, it } from "vitest";
import { SITE } from "@/config/site";
import robots from "./robots";
import sitemap from "./sitemap";

describe("robots and sitemap", () => {
  const rules = robots().rules;
  const disallow = [(Array.isArray(rules) ? rules[0] : rules).disallow].flat();

  it("points at the sitemap", () => {
    expect(robots().sitemap).toBe(`${SITE.url}/sitemap.xml`);
  });

  it("leaves noindex pages crawlable so the noindex is seen", () => {
    for (const path of ["/s/", "/share-card/", "/request", "/survey"]) expect(disallow.some((d) => d && path.startsWith(d))).toBe(false);
  });

  it("lists only pages robots allows", () => {
    for (const { url } of sitemap()) {
      const path = new URL(url).pathname;
      expect(url.startsWith(SITE.url)).toBe(true);
      expect(disallow.some((d) => d && path.startsWith(d))).toBe(false);
    }
  });
});
