import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

/** /whats-new shows what's due by today in Eastern time, newest first. */
vi.mock("next/server", () => ({ connection: async () => {} }));

const { default: WhatsNewPage } = await import("./page");

const render = async (iso: string) => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(iso));
  return renderToStaticMarkup(await WhatsNewPage()).replaceAll("&#x27;", "'");
};
afterEach(() => vi.useRealTimers());

describe("/whats-new", () => {
  it("lists the entries newest first, with dates, titles and links", async () => {
    const html = await render("2026-11-20T15:00:00Z");
    const titles = [...html.matchAll(/<h2[^>]*>([^<]+)<\/h2>/g)].map((m) => m[1]);
    // Newest first: the entries due by the 20th, the 21 Nov one held back.
    expect(titles.indexOf("An Account link and a What's new page")).toBeLessThan(titles.indexOf("Saved searches and weekly alerts"));
    expect(titles).not.toContain("Listings are public by default");
    expect(titles.at(-1)).toBe("Map pins open in view");
    expect(html).toContain('<time dateTime="2026-11-17"');
    expect(html).toContain("November 17, 2026");
    expect(html).toContain('href="/account#alerts"');
  });

  it("keeps the 21 Nov entry back until midnight Eastern", async () => {
    expect(await render("2026-11-21T04:59:00Z")).not.toContain("Listings are public by default"); // 23:59 on the 20th
    const html = await render("2026-11-21T05:00:00Z"); // 00:00 on the 21st
    expect(html.indexOf("Listings are public by default")).toBeLessThan(html.indexOf("An Account link and"));
  });
});
