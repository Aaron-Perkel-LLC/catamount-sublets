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

const DATES = ["2026-11-17", "2026-11-16"];
let host: HTMLElement;
let root: Root | null = null;
const link = () => createElement(WhatsNewLink, { dates: DATES, className: "link" });
const hasDot = () => host.textContent?.includes("(new)") ?? false;
async function mount(el: ReactElement = link()) {
  root = createRoot(host);
  await act(async () => root!.render(el));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-20T15:00:00Z"));
  localStorage.clear();
  host = document.createElement("div");
  document.body.appendChild(host);
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  document.body.innerHTML = "";
  vi.useRealTimers();
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
    localStorage.setItem(WHATS_NEW_SEEN_KEY, "2026-11-17");
    await mount();
    expect(hasDot()).toBe(false);
    act(() => root!.unmount());
    localStorage.setItem(WHATS_NEW_SEEN_KEY, "2026-11-16");
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
    await mount(createElement(MarkWhatsNewSeen, { newest: "2026-11-17" }));
    expect(localStorage.getItem(WHATS_NEW_SEEN_KEY)).toBe("2026-11-17");
    act(() => root!.unmount());
    await mount(createElement(MarkWhatsNewSeen, { newest: "2026-11-16" }));
    expect(localStorage.getItem(WHATS_NEW_SEEN_KEY)).toBe("2026-11-17");
  });

  it("survives blocked storage", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    await mount(createElement(MarkWhatsNewSeen, { newest: "2026-11-17" }));
  });
});
