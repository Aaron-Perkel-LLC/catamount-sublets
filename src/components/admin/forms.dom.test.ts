// @vitest-environment jsdom
import { act, createElement, type FunctionComponent } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NoticeAdminRow } from "@/server/data/notices";
import type { PersonDto, SemesterRowDto } from "./types";

/**
 * The step that stands between the admin and something that can't be taken
 * back, form by form: a preview before an email goes, a code typed back
 * before a semester is archived or its posters are mailed, a confirm before
 * a delete. A restyle moves these controls around; these tests are what says
 * each one is still there and still gates its action. Every Server Action is
 * a mock, so nothing here can send or change anything.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ACTIONS = [
  "adminPreviewMail",
  "adminSendMail",
  "adminBroadcastCount",
  "adminSendBroadcast",
  "adminSetAnnouncement",
  "adminSetReadOnly",
  "adminApproveAccessRequest",
  "adminDismissAccessRequest",
  "adminRevokeApprovedEmail",
  "adminDeletePerson",
  "adminSearchPeople",
  "adminSetBanned",
  "adminSetNoEmail",
  "adminAddSemester",
  "adminArchiveCommit",
  "adminArchivePreview",
  "adminDeleteSemester",
  "adminOutcomeAskPreview",
  "adminSendOutcomeAsks",
  "adminSendOutcomeAskTest",
  "adminToggleSemester",
  "adminDeleteNotice",
  "adminDuplicateNotice",
  "adminSaveNotice",
  "adminSetNoticeActive",
  "adminDigestOverview",
  "adminDigestRender",
  "adminDigestSendTest",
  "adminSetDigestSwitch",
] as const;
type Action = (typeof ACTIONS)[number];

const h = vi.hoisted(() => ({ a: {} as Record<string, ReturnType<typeof vi.fn>>, refresh: vi.fn() }));
vi.mock("@/server/actions/admin", () => h.a);
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: h.refresh, push: vi.fn(), replace: vi.fn() }), usePathname: () => "/admin", useSearchParams: () => new URLSearchParams() }));
for (const name of ACTIONS) h.a[name] = vi.fn();
const a = h.a as Record<Action, ReturnType<typeof vi.fn>>;

let root: Root;
let host: HTMLElement;
let confirmSpy: ReturnType<typeof vi.spyOn>;
let promptSpy: ReturnType<typeof vi.spyOn>;

async function mount<P extends object>(component: FunctionComponent<P>, props: P) {
  await act(async () => {
    root.render(createElement(component, props));
  });
  await settle();
}
/** Lets a transition's awaited action, and the render after it, finish. */
async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}
async function click(el: Element | null | undefined) {
  expect(el, "the control to click").toBeTruthy();
  await act(async () => {
    (el as HTMLElement).click();
  });
  await settle();
}
async function type(el: Element | null | undefined, value: string) {
  expect(el, "the field to type in").toBeTruthy();
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el!.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}
const all = <T extends Element>(selector: string, within: ParentNode = document) => [...within.querySelectorAll<T>(selector)];
const button = (name: string, within: ParentNode = document) => all<HTMLButtonElement>("button", within).find((b) => b.textContent?.trim() === name);
/** The card (a section with a heading) whose title is `title`. */
const card = (title: string) => all<HTMLElement>("section").find((s) => s.querySelector("h2")?.textContent?.trim().startsWith(title))!;
/** The field a label's words name: wrapped by the label, or pointed at by it. */
function field<T extends HTMLElement = HTMLInputElement>(words: string, within: ParentNode = document): T {
  const label = all<HTMLLabelElement>("label", within).find((l) => l.textContent?.trim().startsWith(words));
  expect(label, `a field labelled "${words}"`).toBeTruthy();
  return (label!.htmlFor ? document.getElementById(label!.htmlFor) : label!.querySelector("input, textarea, select")) as T;
}

beforeEach(() => {
  for (const name of ACTIONS) a[name].mockReset().mockResolvedValue({ ok: true, data: {} });
  h.refresh.mockReset();
  confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
  promptSpy = vi.spyOn(window, "prompt").mockReturnValue(null);
  // jsdom has the element but not its modal behaviour.
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

const person = (patch: Partial<PersonDto> = {}): PersonDto => ({ id: "u1", email: "sam@example.com", name: "Sam", role: "user", banned: false, banReason: null, noEmail: false, lastLoginAt: null, createdAt: "2026-11-01T15:00:00.000Z", legacyNetid: null, post: null, ...patch });
const SEMESTERS: SemesterRowDto[] = [
  { code: "spring27", name: "Spring 2027", active: true, archivedAt: null, postCount: 1 },
  { code: "fall26", name: "Fall 2026", active: false, archivedAt: null, postCount: 2 },
  { code: "summer25", name: "Summer 2025", active: false, archivedAt: null, postCount: 0 },
];

describe("Mail: one email to one address", () => {
  const preview = (token: string) => ({ ok: true, data: { html: "<p>Rendered</p>", text: "Rendered, plain", token, warning: null } });
  async function write() {
    const { MailComposer } = await import("./MailComposer");
    await mount(MailComposer, {});
    await type(field("To"), "someone@example.com");
    await type(field("Subject"), "Hello");
    await type(field<HTMLTextAreaElement>("Message"), "A note.");
  }

  it("can't send until it has been previewed, and the preview is the rendered email with its plain text", async () => {
    a.adminPreviewMail.mockResolvedValue(preview("tok-1"));
    await write();
    expect(button("Send")!.disabled).toBe(true);
    expect(document.querySelector("iframe")).toBeNull();
    expect(a.adminSendMail).not.toHaveBeenCalled();

    await click(button("Preview"));
    expect(a.adminPreviewMail).toHaveBeenCalledWith({ to: "someone@example.com", subject: "Hello", body: "A note." });
    const frame = document.querySelector<HTMLIFrameElement>('iframe[title="Email preview"]')!;
    expect(frame.getAttribute("srcdoc")).toBe("<p>Rendered</p>");
    expect(frame.getAttribute("sandbox")).toBe("");
    expect(document.querySelector("pre")!.textContent).toBe("Rendered, plain");
    expect(button("Send")!.disabled).toBe(false);
  });

  it("throws the preview away on any edit, and sends under the token of the preview just looked at", async () => {
    a.adminPreviewMail.mockResolvedValueOnce(preview("tok-1")).mockResolvedValueOnce(preview("tok-2"));
    a.adminSendMail.mockResolvedValue({ ok: true, data: { duplicate: false, resolved: null } });
    await write();
    await click(button("Preview"));
    await type(field("Subject"), "Hello again");
    expect(document.querySelector("iframe")).toBeNull();
    expect(button("Send")!.disabled).toBe(true);

    await click(button("Preview"));
    await click(button("Send"));
    expect(a.adminSendMail).toHaveBeenCalledTimes(1);
    expect(a.adminSendMail).toHaveBeenCalledWith({ to: "someone@example.com", subject: "Hello again", body: "A note.", accessRequestId: null, resolve: null }, "tok-2");
  });

  it("says how to write the message under the field", async () => {
    await write();
    expect(host.textContent).toContain("A blank line starts a paragraph");
  });
});

describe("Requests: reply, approve, dismiss", () => {
  const requests = { pending: [{ id: 7, kind: "access", name: "Dana", email: "dana@example.com", school: null, message: "Please", createdAt: "2026-11-10T15:00:00.000Z", messages: [] }], approved: ["let-in@example.com"] };
  async function open() {
    const { RequestsTab } = await import("./RequestsTab");
    await mount(RequestsTab, { requests });
  }

  it("Reply is the same write, preview, send", async () => {
    await open();
    expect(button("Preview")).toBeUndefined();
    await click(button("Reply"));
    expect(button("Preview")).toBeTruthy();
    expect(button("Send")!.disabled).toBe(true);
    expect(field("To").value).toBe("dana@example.com");
  });

  it("Approve and Remove ask first; Dismiss, which lets nobody in and sends nothing, doesn't", async () => {
    await open();
    await click(button("Approve"));
    expect(confirmSpy).toHaveBeenLastCalledWith("Let dana@example.com sign in?");
    expect(a.adminApproveAccessRequest).not.toHaveBeenCalled();
    await click(button("Remove"));
    expect(confirmSpy).toHaveBeenLastCalledWith("Remove let-in@example.com? They won't be able to sign in again.");
    expect(a.adminRevokeApprovedEmail).not.toHaveBeenCalled();

    confirmSpy.mockReturnValue(true);
    await click(button("Approve"));
    expect(a.adminApproveAccessRequest).toHaveBeenCalledWith(7);
    await click(button("Dismiss"));
    expect(a.adminDismissAccessRequest).toHaveBeenCalledWith(7);
  });
});

describe("Announce: banner, popups, broadcast email", () => {
  const notice = (patch: Partial<NoticeAdminRow>): NoticeAdminRow => ({ id: 1, title: "Live one", bodyMd: "Body", audience: "everyone" as NoticeAdminRow["audience"], ctaLabel: null, ctaHref: null, active: true, endsOn: null, ended: false, updatedAt: "2026-11-10T15:00:00.000Z", views: 0, dismissals: 0, ctaClicks: 0, ...patch });
  async function open() {
    a.adminBroadcastCount.mockResolvedValue(3);
    const { AnnounceTab } = await import("./AnnounceTab");
    await mount(AnnounceTab, {
      announcement: { active: true, message: "Up now", style: "info" as const },
      semesters: SEMESTERS,
      people: [person(), person({ id: "u2", email: "noname@example.com", name: null })],
      notices: [notice({}), notice({ id: 2, title: "Draft", active: false })],
    });
  }

  it("banner: shows the banner as typed, and asks before clearing it", async () => {
    await open();
    const banner = card("Banner");
    await type(field<HTMLTextAreaElement>("Message", banner), "Spring listings open Monday");
    expect(banner.textContent).toContain("Spring listings open Monday");
    await click(button("Clear", banner));
    expect(confirmSpy).toHaveBeenLastCalledWith("Clear the banner?");
    expect(a.adminSetAnnouncement).not.toHaveBeenCalled();
    confirmSpy.mockReturnValue(true);
    await click(button("Clear", banner));
    expect(a.adminSetAnnouncement).toHaveBeenCalledWith({ active: false, message: "", style: "info" });
  });

  it("popups: asks before replacing the live one or deleting one, and the form shows the popup itself", async () => {
    await open();
    const draft = all<HTMLLIElement>("li", card("Popups")).find((li) => li.textContent?.includes("Draft"))!;
    await click(button("Activate", draft));
    expect(confirmSpy).toHaveBeenLastCalledWith('This replaces the live popup, "Live one".');
    await click(button("Delete", draft));
    expect(confirmSpy).toHaveBeenLastCalledWith('Delete "Draft" and its counts? This can\'t be undone.');
    expect(a.adminSetNoticeActive).not.toHaveBeenCalled();
    expect(a.adminDeleteNotice).not.toHaveBeenCalled();

    await click(button("New popup"));
    expect(document.querySelector('[aria-label="Preview of the popup"]')).toBeTruthy();
    expect(card("Popups").textContent).toContain("**bold**, *italic*");
  });

  it("email: names its placeholders in sight, offers named people, and asks with the count before it sends", async () => {
    await open();
    const email = card("Email");
    expect(email.textContent).toContain("{name} is the person's name");
    expect(email.textContent).toContain("{survey} is their own survey link");
    expect(email.textContent).toContain("3 recipients");

    const named = all<HTMLLabelElement>("label", email).find((l) => l.textContent?.trim() === "Named people")!;
    await click(named.querySelector("input"));
    expect(email.textContent).toContain("Sam · sam@example.com");
    await click(all<HTMLLabelElement>("label", email).find((l) => l.textContent?.trim() === "Everyone with a listing on the board")!.querySelector("input"));

    await type(field("Subject", email), "News");
    await type(field<HTMLTextAreaElement>("Message", email), "Hello {name}. {survey}");
    await click(button("Send", email));
    expect(confirmSpy).toHaveBeenLastCalledWith("Send to 3 people?");
    expect(a.adminSendBroadcast).not.toHaveBeenCalled();

    confirmSpy.mockReturnValue(true);
    a.adminSendBroadcast.mockResolvedValue({ ok: true, data: { sent: 3, failed: 0 } });
    await click(button("Send", email));
    expect(a.adminSendBroadcast).toHaveBeenCalledWith({ kind: "all" }, "News", "Hello {name}. {survey}");
  });
});

describe("Digest: the switch and a test to me", () => {
  const overview = (patch: object = {}) => ({ switchOn: false, blockers: [], nextDate: "2026-11-23", hour: 9, totals: { subscribed: 2, searches: 3 }, week: null, skipped: {}, rows: [{ userId: "user-abcdef-123", ref: "user-abc", searches: 1, matches: 2, state: "would_send" }], ...patch });
  async function open(patch: object = {}) {
    a.adminDigestOverview.mockResolvedValue(overview(patch));
    const { DigestTab } = await import("./DigestTab");
    await mount(DigestTab, {});
  }

  it("the switch turns it on, unless something blocks it", async () => {
    await open();
    await click(button("Turn on"));
    expect(a.adminSetDigestSwitch).toHaveBeenCalledWith(true);
    act(() => root.unmount());
    root = createRoot(host);
    await open({ blockers: ["MAILING_ADDRESS is not set."] });
    expect(button("Turn on")!.disabled).toBe(true);
    expect(host.textContent).toContain("MAILING_ADDRESS is not set.");
  });

  it("a person's email is rendered before a test can go, and the test goes through its own action", async () => {
    a.adminDigestRender.mockResolvedValue({ subject: "2 new sublets", html: "<p>Digest</p>", text: "Digest", total: 2, fallback: false });
    a.adminDigestSendTest.mockResolvedValue({ ok: true, data: { to: "me@example.com", total: 2, fallback: false } });
    await open();
    expect(button("Send a test to me")).toBeUndefined();
    await click(button("user-abc"));
    expect(a.adminDigestRender).toHaveBeenCalledWith("user-abcdef-123");
    expect(document.querySelector('iframe[title="Digest preview"]')!.getAttribute("srcdoc")).toBe("<p>Digest</p>");
    await click(button("Send a test to me"));
    expect(a.adminDigestSendTest).toHaveBeenCalledWith("user-abcdef-123");
    expect(host.textContent).toContain("Test sent to me@example.com");
  });
});

describe("Semesters: ask posters, archive, hide, delete", () => {
  const dialogOf = (heading: string) => all<HTMLDialogElement>("dialog").find((d) => d.querySelector("h2")?.textContent?.includes(heading))!;
  async function open() {
    const { SemestersTab } = await import("./SemestersTab");
    await mount(SemestersTab, { semesters: SEMESTERS, archives: [] });
  }

  it("Ask posters shows who it would go to, offers a test to me, and sends only once the code is typed back", async () => {
    a.adminOutcomeAskPreview.mockResolvedValue({ code: "fall26", name: "Fall 2026", blocking: [], recipients: [{ listingId: 4, name: "Priya", email: "priya@example.com", place: "280 Pearl St", status: "open" }], alreadyAsked: 0, testListings: [{ listingId: 4, label: "#4 280 Pearl St" }] });
    a.adminSendOutcomeAsks.mockResolvedValue({ ok: true, data: { sent: 1, failed: 0, skipped: 0 } });
    await open();
    await click(button("Ask posters…"));
    expect(a.adminOutcomeAskPreview).toHaveBeenCalledWith("fall26"); // the hidden semester with listings is offered first
    const dialog = dialogOf("Ask Fall 2026 posters");
    expect(dialog.hasAttribute("open")).toBe(true);
    expect(dialog.textContent).toContain("280 Pearl St");
    expect(all("summary", dialog).some((s) => s.textContent?.trim() === "Send test to me")).toBe(true);
    expect(button("Send test to me", dialog)).toBeTruthy();

    const send = button("Send to 1 poster", dialog)!;
    expect(send.disabled).toBe(true);
    await type(field("Type fall26 to send", dialog), "fall2");
    expect(send.disabled).toBe(true);
    await type(field("Type fall26 to send", dialog), "fall26");
    expect(send.disabled).toBe(false);
    expect(a.adminSendOutcomeAsks).not.toHaveBeenCalled();
    await click(send);
    expect(a.adminSendOutcomeAsks).toHaveBeenCalledWith("fall26", "fall26");
  });

  it("Archive is a dry run first, and commits only once the code is typed back", async () => {
    a.adminArchivePreview.mockResolvedValue({ code: "fall26", name: "Fall 2026", blocking: [], going: [], staying: [], totals: { listings: 0, taken: 0, photos: 0, bytes: 0, priceMedian: null, priceMin: null, priceMax: null, views: 0, contacts: 0, shares: 0, shareArrivals: 0 } });
    a.adminArchiveCommit.mockResolvedValue({ ok: true, data: { listings: 0, filesDeleted: 0 } });
    await open();
    await click(button("Archive…"));
    expect(a.adminArchivePreview).toHaveBeenCalledWith("fall26");
    const commit = button("Archive for good")!;
    expect(commit.disabled).toBe(true);
    await type(field("Type fall26 to confirm"), "fall26");
    expect(commit.disabled).toBe(false);
    expect(a.adminArchiveCommit).not.toHaveBeenCalled();
    await click(commit);
    expect(a.adminArchiveCommit).toHaveBeenCalledWith("fall26", "fall26");
  });

  it("asks before hiding a semester that has listings, and before deleting one", async () => {
    await open();
    await click(button("Hide"));
    expect(confirmSpy.mock.lastCall?.[0]).toMatch(/^Hide Spring 2027\? 1 listing/);
    await click(button("Delete"));
    expect(confirmSpy).toHaveBeenLastCalledWith("Delete Summer 2025?");
    expect(a.adminToggleSemester).not.toHaveBeenCalled();
    expect(a.adminDeleteSemester).not.toHaveBeenCalled();
  });
});

describe("People: ban, stop email, delete", () => {
  async function menu() {
    await click(document.querySelector('button[aria-label="Actions for Sam"]'));
  }
  async function open() {
    const { PeopleTab } = await import("./PeopleTab");
    await mount(PeopleTab, { people: [person()], initialSearch: { q: "", ids: null }, meId: "me", focus: null, onOpenPost: () => {} });
  }

  it("Ban asks for a reason and does nothing if that is cancelled; Stop email is one press, as it can be undone", async () => {
    await open();
    await menu();
    await click(button("Ban…"));
    expect(promptSpy).toHaveBeenCalledTimes(1);
    expect(a.adminSetBanned).not.toHaveBeenCalled();

    promptSpy.mockReturnValue("Spam");
    await menu();
    await click(button("Ban…"));
    expect(a.adminSetBanned).toHaveBeenCalledWith("u1", true, "Spam");

    await menu();
    await click(button("Stop email"));
    expect(a.adminSetNoEmail).toHaveBeenCalledWith("u1", true);
  });

  it("Delete counts what would go, says so, and deletes only on a yes", async () => {
    a.adminDeletePerson.mockResolvedValue({ ok: true, data: { email: "sam@example.com", listingId: 3, photos: 2, events: 9, sessions: 1, messages: 0 } });
    await open();
    await menu();
    await click(button("Delete…"));
    expect(a.adminDeletePerson).toHaveBeenCalledTimes(1);
    expect(a.adminDeletePerson).toHaveBeenLastCalledWith("u1", true);
    expect(confirmSpy.mock.lastCall?.[0]).toMatch(/^Delete Sam \(sam@example\.com\)\? Their account, listing #3 with 2 photo\(s\).*This cannot be undone\.$/);

    confirmSpy.mockReturnValue(true);
    await menu();
    await click(button("Delete…"));
    expect(a.adminDeletePerson).toHaveBeenLastCalledWith("u1", false);
  });
});

describe("System: the read-only switch", () => {
  it("is folded away while it is off, and saves the tick and the message together", async () => {
    const { Maintenance } = await import("./AnnounceTab");
    await mount(Maintenance, { readOnly: { active: false, message: "" } });
    expect(document.querySelector("details")!.hasAttribute("open")).toBe(false);
    await type(field("Message"), "Back at noon.");
    await click(all<HTMLLabelElement>("label").find((l) => l.textContent?.trim() === "Site is read-only")!.querySelector("input"));
    expect(a.adminSetReadOnly).not.toHaveBeenCalled();
    await click(button("Save switch"));
    expect(a.adminSetReadOnly).toHaveBeenCalledWith(true, "Back at noon.");
  });
});
