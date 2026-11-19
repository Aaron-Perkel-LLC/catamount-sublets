import { render } from "@react-email/components";
import { describe, expect, it } from "vitest";
import { SITE } from "@/config/site";
import AdminEmail, { adminEmailText, MAILING_ADDRESS_MISSING } from "./admin-email";

const body = "Hi Sam,\n\nSee https://example.org/a or write to pat@example.org.\nSecond line.";
const group = { unsubscribeUrl: `${SITE.url}/unsubscribe?t=tok`, mailingAddress: "PO Box 1, Burlington, VT 05402", posted: true };

describe("the admin's email", () => {
  it("to one person: the words, links, the sign-off, and no unsubscribe or postal address", async () => {
    const html = await render(AdminEmail({ body, group: null }));
    expect(html).toContain('href="https://example.org/a"');
    expect(html).toContain('href="mailto:pat@example.org"');
    expect(html).toContain("Second line.");
    expect(html).not.toMatch(/unsubscribe|PO Box/i);
    const text = adminEmailText(body, null);
    expect(text).toContain("Hi Sam,\n\nSee https://example.org/a or write to pat@example.org.\nSecond line.");
    expect(text).toContain(`Thanks,\n${SITE.author.split(" ")[0]}\n${SITE.supportEmail}`);
    expect(text).toContain("Reply to this email to reach me directly.");
    expect(text).not.toMatch(/unsubscribe/i);
  });

  it("to a group: says why they are getting it, and carries the unsubscribe link and the postal address", async () => {
    const html = await render(AdminEmail({ body, group }));
    expect(html).toContain(`href="${group.unsubscribeUrl}"`);
    expect(html).toContain("PO Box 1, Burlington, VT 05402");
    expect(html).toContain("posted a listing");
    const text = adminEmailText(body, { ...group, posted: false });
    expect(text).toContain("because you have an account");
    expect(text).toContain(`Unsubscribe from announcements like this one: ${group.unsubscribeUrl}`);
    expect(text).toContain(`${SITE.name}, PO Box 1, Burlington, VT 05402`);
    // A missing address shows as missing rather than as nothing (sending is blocked before this is ever sent).
    expect(adminEmailText(body, { ...group, mailingAddress: "" })).toContain(MAILING_ADDRESS_MISSING);
  });

  it("is only ever text and links: markup in the body arrives as typed", async () => {
    const html = await render(AdminEmail({ body: '<script>alert(1)</script> <a href="x">y</a>', group: null }));
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
