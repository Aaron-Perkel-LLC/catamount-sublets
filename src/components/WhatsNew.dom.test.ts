// @vitest-environment jsdom
import { act, createElement, type ReactElement } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WHATS_NEW_SEEN_KEY } from "@/lib/whats-new";
import { MarkWhatsNewSeen, WhatsNewLink } from "./WhatsNew";

/**
 * The footer's dot in a browser (jsdom): none in the server render, so
 * hydration agrees; then localStorage decides, and /whats-new clears it.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLElement;
let root: Root | null = null;
const link = () => createElement(WhatsNewLink, { latest: "2026-11-17#1", today: "2026-11-20", className: "link" });
const hasDot = () => host.textContent?.includes("(new)") ?? false;
async function mount(el: ReactElement = link()) {
  root = createRoot(host);
  await act(async () => root!.render(el));
}

beforeEach(() => {
  localStorage.clear();
  host = document.createElement("div");
  document.body.appendChild(host);
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("WhatsNewLink", () => {
  it("renders no dot on the server, hydrates without a mismatch, then shows it for a first visit", async () => {
    const html = renderToString(link());
    expect(html).not.toContain("(new)");
    host.innerHTML = html;
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    await act(async () => {
      root = hydrateRoot(host, link());
    });
    expect(errors).not.toHaveBeenCalled();
    expect(hasDot()).toBe(true);
    expect(host.querySelector("a")?.getAttribute("href")).toBe("/whats-new");
  });

  it("no dot once the newest entry has been seen; a dot again for a newer one", async () => {
    localStorage.setItem(WHATS_NEW_SEEN_KEY, "2026-11-17#1");
    await mount();
    expect(hasDot()).toBe(false);
    act(() => root!.unmount());
    localStorage.setItem(WHATS_NEW_SEEN_KEY, "2026-11-16#1");
    await mount();
    expect(hasDot()).toBe(true);
  });

  it("no dot, and no error, when storage is blocked", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    await mount();
    expect(hasDot()).toBe(false);
  });
});

describe("MarkWhatsNewSeen", () => {
  it("records the newest entry shown, never moving backwards", async () => {
    await mount(createElement(MarkWhatsNewSeen, { latest: "2026-11-17#1" }));
    expect(localStorage.getItem(WHATS_NEW_SEEN_KEY)).toBe("2026-11-17#1");
    act(() => root!.unmount());
    await mount(createElement(MarkWhatsNewSeen, { latest: "2026-11-16#2" }));
    expect(localStorage.getItem(WHATS_NEW_SEEN_KEY)).toBe("2026-11-17#1");
  });

  it("when storage reads but won't write, the dot still goes for the rest of the page session", async () => {
    vi.resetModules(); // a fresh page session: the earlier tests set the module's flag
    const fresh = await import("./WhatsNew");
    const freshLink = () => createElement(fresh.WhatsNewLink, { latest: "2026-11-17#1", today: "2026-11-20", className: "link" });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    await mount(freshLink());
    expect(hasDot()).toBe(true); // nothing stored: a first visit
    act(() => root!.unmount());
    await mount(createElement(fresh.MarkWhatsNewSeen, { latest: "2026-11-17#1" }));
    act(() => root!.unmount());
    await mount(freshLink());
    expect(hasDot()).toBe(false);
  });
});
