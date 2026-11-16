import { render } from "@react-email/components";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { SITE } from "@/config/site";
import { EMAIL_ANSWER_VALUES, EMAIL_ANSWERS } from "@/lib/listing-outcome";
import OutcomeAskEmail, { OUTCOME_ASK_SUBJECT } from "./outcome-ask";

const links = Object.fromEntries(EMAIL_ANSWER_VALUES.map((a) => [a, `${SITE.url}/outcome?t=187.1800000000.${"0".repeat(32)}&a=${a}`])) as Record<(typeof EMAIL_ANSWER_VALUES)[number], string>;

describe("OutcomeAskEmail", () => {
  it("has the four answers as links, each the poster's own, in order", async () => {
    const el = createElement(OutcomeAskEmail, { name: "Sam", place: "52 North Willard Street", semesterName: "Spring 2027", links });
    const html = await render(el);
    for (const a of EMAIL_ANSWER_VALUES) {
      expect(html).toContain(`href="${links[a].replace("&", "&amp;")}"`);
      expect(html).toContain(EMAIL_ANSWERS[a]);
    }
    const positions = EMAIL_ANSWER_VALUES.map((a) => html.indexOf(links[a].replace("&", "&amp;")));
    expect([...positions].sort((x, y) => x - y)).toEqual(positions);

    const text = await render(el, { plainText: true });
    expect(text).toContain("Hi Sam,");
    expect(text).toContain("52 North Willard Street");
    expect(text).toContain("Spring 2027");
    expect(text).toContain("unsubscribe");
    expect(text).toContain("marks your listing as taken");
  });

  it("greets without a name and asks in plain words", async () => {
    const text = await render(createElement(OutcomeAskEmail, { name: "", place: "1 Main St", semesterName: "Fall 2027", links }), { plainText: true });
    expect(text).toContain("Hi,\n");
    expect(OUTCOME_ASK_SUBJECT).toBe("Is your sublet still available?");
  });
});
