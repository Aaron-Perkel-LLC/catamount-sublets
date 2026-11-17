// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NoticeDto } from "@/lib/notices";

/**
 * The popup in a browser (jsdom): it waits for the page, skips /admin, keeps
 * focus inside, and Escape, the backdrop, Got it and the CTA each dismiss it
 * once: signed out into localStorage (or, if storage throws, for this page
 * session only), signed in through the Server Action.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({ pathname: "/browse", push: vi.fn(), dismiss: vi.fn(async () => {}), track: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => h.pathname, useRouter: () => ({ push: h.push }) }));
vi.mock("@/server/actions/notices", () => ({ dismissNoticeAction: h.dismiss }));
vi.mock("@/lib/track", () => ({ trackNotice: h.track }));

let nextId = 1;
const notice = (patch: Partial<NoticeDto> = {}): NoticeDto => ({ id: nextId++, title: "Heads up", bodyMd: "", ctaLabel: null, ctaHref: null, ...patch });

let root: Root;
let host: HTMLElement;
let trigger: HTMLButtonElement;

async function mount(n: NoticeDto, signedIn = false) {
  const { NoticePopup } = await import("./NoticeDialog");
  // children as createElement's third argument (react/no-children-prop), which its typings can't see as the required prop
  const Popup = NoticePopup as (props: { notice: NoticeDto; signedIn: boolean; children?: ReactNode }) => ReactNode;
  await act(async () => {
    root.render(createElement(Popup, { notice: n, signedIn }, createElement("p", null, "Body text")));
  });
}
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');
const wait = async (ms = 600) => {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
};

beforeEach(() => {
  vi.useFakeTimers();
  h.pathname = "/browse";
  h.push.mockClear();
  h.dismiss.mockClear();
  h.track.mockClear();
  localStorage.clear();
  trigger = document.createElement("button");
  document.body.appendChild(trigger);
  trigger.focus();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("NoticePopup", () => {
  it("opens after the page has painted, as a labelled modal dialog with focus inside, and counts one view", async () => {
    const n = notice();
    await mount(n);
    expect(dialog()).toBeNull();
    await wait();
    const d = dialog()!;
    expect(d.getAttribute("aria-modal")).toBe("true");
    expect(document.getElementById(d.getAttribute("aria-labelledby")!)?.textContent).toBe("Heads up");
    expect(d.contains(document.activeElement)).toBe(true);
    expect(h.track).toHaveBeenCalledExactlyOnceWith("view", n.id);
  });

  it("never opens on /admin", async () => {
    h.pathname = "/admin";
    await mount(notice());
    await wait();
    expect(dialog()).toBeNull();
    expect(h.track).not.toHaveBeenCalled();
  });

  it("Escape dismisses, stores it, counts it, and gives focus back", async () => {
    const n = notice();
    await mount(n);
    await wait();
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(dialog()).toBeNull();
    expect(localStorage.getItem(`notice:dismissed:${n.id}`)).not.toBeNull();
    expect(h.track).toHaveBeenCalledWith("dismiss", n.id);
    expect(document.activeElement).toBe(trigger);
  });

  it("a click on the backdrop dismisses; a click inside does not", async () => {
    await mount(notice());
    await wait();
    await act(async () => {
      dialog()!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    expect(dialog()).not.toBeNull();
    await act(async () => {
      dialog()!.parentElement!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    expect(dialog()).toBeNull();
  });

  it("Tab stays inside", async () => {
    await mount(notice({ ctaLabel: "Open", ctaHref: "/post" }));
    await wait();
    const focusable = [...dialog()!.querySelectorAll<HTMLElement>("a[href], button")];
    focusable[focusable.length - 1].focus();
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", cancelable: true }));
    });
    expect(document.activeElement).toBe(focusable[0]);
  });

  it("stays dismissed for a signed-out visitor who dismissed it before", async () => {
    const n = notice();
    localStorage.setItem(`notice:dismissed:${n.id}`, "2026-11-18");
    await mount(n);
    await wait();
    expect(dialog()).toBeNull();
  });

  it("when storage throws, it shows at most once in the page session", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    const n = notice();
    await mount(n);
    await wait();
    expect(dialog()).not.toBeNull();
    await act(async () => {
      (dialog()!.querySelector("button") as HTMLButtonElement).click();
    });
    expect(dialog()).toBeNull();
    act(() => root.unmount());
    root = createRoot(host);
    await mount(n); // a client-side navigation to another frame
    await wait();
    expect(dialog()).toBeNull();
  });

  it("signed in, Got it goes through the Server Action, not storage or the beacon", async () => {
    const n = notice();
    await mount(n, true);
    await wait();
    await act(async () => {
      (dialog()!.querySelector("button") as HTMLButtonElement).click();
    });
    expect(h.dismiss).toHaveBeenCalledExactlyOnceWith(n.id, "dismiss");
    expect(h.track).not.toHaveBeenCalledWith("dismiss", n.id);
    expect(localStorage.length).toBe(0);
  });

  it("the CTA counts, dismisses and navigates", async () => {
    const n = notice({ ctaLabel: "Open My post", ctaHref: "/post" });
    await mount(n, true);
    await wait();
    await act(async () => {
      dialog()!.querySelector<HTMLAnchorElement>("a")!.click();
    });
    expect(h.dismiss).toHaveBeenCalledExactlyOnceWith(n.id, "cta");
    expect(h.push).toHaveBeenCalledWith("/post");
    expect(dialog()).toBeNull();
  });
});
