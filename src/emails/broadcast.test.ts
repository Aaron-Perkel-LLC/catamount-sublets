import { render } from "@react-email/components";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import BroadcastEmail, { BROADCAST_SIGNATURE } from "./broadcast";

describe("BroadcastEmail", () => {
  it("breaks the sign-off with <br>, which Outlook honours, not white-space", async () => {
    const el = createElement(BroadcastEmail, { paragraphs: ["Hello."], greeting: null, posted: true });
    const html = await render(el);
    expect(html).toContain(BROADCAST_SIGNATURE.join("<br/>"));
    expect(html).not.toContain("pre-line");
    const text = await render(el, { plainText: true });
    expect(text).toContain(BROADCAST_SIGNATURE.join("\n"));
  });
});
