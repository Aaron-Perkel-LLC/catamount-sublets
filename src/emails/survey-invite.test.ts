import { render } from "@react-email/components";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { ALSO_BY, SITE } from "@/config/site";
import SurveyInviteEmail, { SURVEY_CTA, SURVEY_SUBJECT } from "./survey-invite";

const link = `${SITE.url}/survey?t=00000000-0000-4000-8000-000000000000.1800000000.${"0".repeat(32)}`;

describe("SurveyInviteEmail", () => {
  it("carries the person's link as the button, greets them by first name, and plugs the other product once", async () => {
    const el = createElement(SurveyInviteEmail, { name: "Sam", link, posted: true });
    const html = await render(el);
    expect(html).toContain(`href="${link}"`);
    expect(html).toContain(SURVEY_CTA);
    // React separates adjacent text nodes with comments in HTML; the greeting is checked on the text part.
    expect(html).toContain("have a listing");
    expect(html.split(ALSO_BY.url).length - 1).toBe(1);
    expect(html).toContain(SITE.supportEmail);
    expect(html).not.toContain("pre-line");

    const text = await render(el, { plainText: true });
    expect(text).toContain("Hi Sam,");
    expect(text).toContain(link);
    expect(text).toContain("About ten questions");
    expect(text).toContain("P.S.");
  });

  it("greets without a name and says 'account' for someone without a listing", async () => {
    const el = createElement(SurveyInviteEmail, { name: "", link, posted: false });
    const text = await render(el, { plainText: true });
    expect(text).toContain("Hi,\n");
    expect(text).toContain("because you have an account on");
  });

  it("has a subject in plain words", () => {
    expect(SURVEY_SUBJECT).toContain(SITE.name);
    expect(SURVEY_SUBJECT).not.toMatch(/!/);
  });
});
