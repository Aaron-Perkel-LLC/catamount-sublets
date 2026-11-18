// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NoticeDto } from "@/lib/notices";

/**
 * The popup in a browser (jsdom): it waits for the page, skips /admin, keeps
 * focus inside, and Escape, the backdrop, Got it and the CTA each dismiss it
 * once: signed out into localStorage (or, if storage throws, for this page
 * session only), signed in through the Server Action. So does a link in the
 * body; a navigation it didn't start closes it without dismissing.
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

async function mount(n: NoticeDto, signedIn = false, body: ReactNode = createElement("p", null, "Body text")) {
  const { NoticePopup } = await import("./NoticeDialog");
  // children as createElement's third argument (react/no-children-prop), which its typings can't see as the required prop
  const Popup = NoticePopup as (props: { notice: NoticeDto; signedIn: boolean; children?: ReactNode }) => ReactNode;
  await act(async () => {
    root.render(createElement(Popup, { notice: n, signedIn }, body));
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

  it("a CTA link that isn't a path here or https never renders or navigates", async () => {
    await mount(notice({ ctaLabel: "Click", ctaHref: "javascript:alert(1)" }));
    await wait();
    expect(dialog()!.querySelector("a")).toBeNull();
    expect(h.push).not.toHaveBeenCalled();
  });

  it("a navigation to a page it never shows on hides it and gives focus back", async () => {
    await mount(notice());
    await wait();
    expect(document.activeElement).not.toBe(trigger);
    h.pathname = "/admin";
    await mount(notice()); // re-render with the new path (same component: a different notice id, so a fresh popup)
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  const bodyWith = (href: string, external = false) =>
    createElement("p", null, "See ", createElement("a", { href, ...(external ? { target: "_blank", rel: "noopener noreferrer" } : {}) }, "the map"));
  const clickBodyLink = async () => {
    await act(async () => {
      dialog()!.querySelector<HTMLAnchorElement>("p a")!.click();
    });
  };

  it("signed out, a link in the body dismisses it like Got it (stored, counted as a dismissal) and goes there", async () => {
    const n = notice();
    await mount(n, false, bodyWith("/map"));
    await wait();
    await clickBodyLink();
    expect(dialog()).toBeNull();
    expect(localStorage.getItem(`notice:dismissed:${n.id}`)).not.toBeNull();
    expect(h.track).toHaveBeenCalledWith("dismiss", n.id);
    expect(h.track).not.toHaveBeenCalledWith("cta", n.id);
    expect(h.push).toHaveBeenCalledWith("/map");
  });

  it("signed in, a link in the body records the dismissal before navigating", async () => {
    const n = notice();
    await mount(n, true, bodyWith("/map"));
    await wait();
    await clickBodyLink();
    expect(h.dismiss).toHaveBeenCalledExactlyOnceWith(n.id, "dismiss");
    expect(h.push).toHaveBeenCalledWith("/map");
    expect(dialog()).toBeNull();
  });

  it("an external link in the body opens as it would (new tab) and dismisses", async () => {
    const n = notice();
    await mount(n, true, bodyWith("https://example.com/", true));
    await wait();
    const clicks: Event[] = [];
    document.addEventListener("click", (e) => clicks.push(e), { once: true });
    await clickBodyLink();
    expect(clicks[0]?.defaultPrevented).toBe(false);
    expect(h.dismiss).toHaveBeenCalledExactlyOnceWith(n.id, "dismiss");
    expect(h.push).not.toHaveBeenCalled();
    expect(dialog()).toBeNull();
  });

  it("a navigation while it's open closes it without dismissing, and it stays closed for the page session", async () => {
    const n = notice();
    await mount(n);
    await wait();
    expect(dialog()).not.toBeNull();
    h.pathname = "/map";
    await mount(n); // the same popup re-rendered at the new path, as the persistent frame is
    expect(dialog()).toBeNull();
    expect(localStorage.getItem(`notice:dismissed:${n.id}`)).toBeNull();
    expect(h.track).not.toHaveBeenCalledWith("dismiss", n.id);
    await wait();
    h.pathname = "/browse";
    await mount(n);
    await wait();
    expect(dialog()).toBeNull();
  });
});
