import { render } from "@react-email/components";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { LEGACY, SITE } from "@/config/site";
import StaleNoticeEmail, { staleNoticeSubject } from "./stale-notice";

const props = { name: "Sam", street: "12 Main St", email: "sam@uvm.edu", deadline: "2026-11-20" };

describe("StaleNoticeEmail", () => {
  it("says what moved, when it comes down (Eastern, 11:59 pm Friday), and which address to sign in with", async () => {
    const text = await render(createElement(StaleNoticeEmail, props), { plainText: true });
    expect(text).toContain("Hi Sam,");
    expect(text).toContain(`When ${LEGACY.name} moved to ${SITE.domain} in October, your listing for 12 Main St came over with it.`);
    expect(text).toContain("by 11:59 pm on Friday, November 20.");
    expect(text).toContain("with sam@uvm.edu, and that's it.");
    expect(text).toContain("Questions? Just reply to this email.");
    expect(text).toContain(`— ${SITE.author.split(" ")[0]}`);
    expect(text).not.toMatch(/P\.S\./);
  });

  it("links only to the front page in the body: no buttons, no images, no signed links", async () => {
    const html = await render(createElement(StaleNoticeEmail, props));
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    // The layout's copyright line links the operator, as on every email; nothing else but the front page.
    expect(new Set(hrefs)).toEqual(new Set([SITE.url, SITE.operatorUrl].filter((u, i, a) => a.indexOf(u) === i)));
    expect(hrefs.filter((h) => h === SITE.url)).toHaveLength(1);
    expect(html).not.toMatch(/<img|\?t=|token/i);
  });

  it("greets without a name", async () => {
    const text = await render(createElement(StaleNoticeEmail, { ...props, name: "" }), { plainText: true });
    expect(text).toContain("Hi,\n");
  });

  it("says \"your listing\" alone when there is no street to name", async () => {
    const text = await render(createElement(StaleNoticeEmail, { ...props, street: null }), { plainText: true });
    expect(text).toContain("in October, your listing came over with it.");
    expect(text).not.toContain("listing for");
    const html = await render(createElement(StaleNoticeEmail, { ...props, street: null }));
    expect(html).toContain("to keep your listing up.");
    expect(html).not.toContain("listing for");
  });

  it("puts the short deadline in the subject, with a Reminder prefix for the second send", () => {
    expect(staleNoticeSubject("2026-11-20")).toBe("Your sublet listing comes down Nov 20");
    expect(staleNoticeSubject("2026-11-20", true)).toBe("Reminder: Your sublet listing comes down Nov 20");
  });
});
