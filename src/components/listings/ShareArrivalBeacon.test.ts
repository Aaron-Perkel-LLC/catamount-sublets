import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const trackShareArrival = vi.fn();
vi.mock("@/lib/track", () => ({ trackShareArrival }));
const { ShareArrivalBeacon } = await import("./ShareArrivalBeacon");

describe("ShareArrivalBeacon", () => {
  it("records nothing when the page is rendered on the server (what a link unfurler gets)", () => {
    const html = renderToString(createElement(ShareArrivalBeacon, { listingId: 42, slug: "42-abcdefghij" }));
    expect(html).toBe("");
    expect(trackShareArrival).not.toHaveBeenCalled();
  });
});
