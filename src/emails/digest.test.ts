import { render } from "@react-email/components";
import { describe, expect, it } from "vitest";
import { SITE } from "@/config/site";
import DigestEmail, { digestSubject, digestText, MAILING_ADDRESS_PLACEHOLDER } from "./digest";

const props = DigestEmail.PreviewProps;

describe("digest email", () => {
  it("has a plain subject", () => {
    expect(digestSubject(1, false)).toBe("1 new sublet matching your search");
    expect(digestSubject(3, false)).toBe("3 new sublets matching your search");
    expect(digestSubject(3, true)).toBe("3 new sublets matching your searches");
  });

  it("is text with links, no image unless one is passed, and an unsubscribe link and postal line in the footer", async () => {
    const html = await render(DigestEmail(props));
    expect(html).not.toContain("<img");
    expect(html).toContain(props.unsubscribeUrl.replace(/&/g, "&amp;"));
    expect(html).toContain(">Unsubscribe<");
    expect(html).toContain(`<br/>${SITE.name}, ${MAILING_ADDRESS_PLACEHOLDER}<br/>${SITE.disclaimer}`);
    const withAddress = DigestEmail({ ...props, mailingAddress: "PO Box 1, Burlington, VT 05402" });
    expect(await render(withAddress)).toContain(`<br/>${SITE.name}, PO Box 1, Burlington, VT 05402<br/>`);
    expect(digestText({ ...props, mailingAddress: "PO Box 1, Burlington, VT 05402" }).split("\n")).toContain(`${SITE.name}, PO Box 1, Burlington, VT 05402`);
    const withImage = await render(DigestEmail({ ...props, firstThumb: "https://media.example/t.jpg" }));
    expect(withImage.match(/<img/g)).toHaveLength(1);
  });

  it("writes a plain-text part with each link on its own line and the more-count", () => {
    const text = digestText(props);
    for (const l of props.listings) expect(text.split("\n")).toContain(l.url);
    expect(text).toContain(`${props.total - props.listings.length} more on the site`);
    expect(text).toContain(`Unsubscribe: ${props.unsubscribeUrl}`);
  });
});
