import { describe, expect, it } from "vitest";
import { listingInput } from "./listing-input";
import { surveySchema } from "./survey";

/**
 * GHSA-mrhx-c7xc-m3w5: zod before 4.6.6 kept one issue per failing element
 * of an array, so a huge array could exhaust memory. Every array we take from
 * a request is bounded, and an oversized one is refused, quickly.
 */
const huge = Array.from({ length: 200_000 }, () => "!");

describe("array inputs are bounded", () => {
  it("the post form's semesters", () => {
    const t = Date.now();
    const r = listingInput.safeParse({ semesters: huge });
    expect(r.success).toBe(false);
    const issues = (semesters: string[]) => listingInput.safeParse({ semesters }).error?.issues.filter((i) => i.path[0] === "semesters") ?? [];
    expect(issues(Array.from({ length: 13 }, (_, i) => `fall${i}`)).map((i) => i.message)).toEqual(["Pick at most 12 semesters."]);
    expect(issues(Array.from({ length: 12 }, (_, i) => `fall${i}`))).toEqual([]);
    expect(Date.now() - t).toBeLessThan(2000);
  });

  it("the survey's \"useful\" answers", () => {
    const t = Date.now();
    const r = surveySchema.safeParse({ useful: huge });
    expect(Date.now() - t).toBeLessThan(2000);
    expect(r.success).toBe(false);
  });
});
