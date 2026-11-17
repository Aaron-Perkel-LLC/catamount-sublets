import { describe, expect, it } from "vitest";
import { liveMailRefusal } from "./stale-files";

describe("liveMailRefusal", () => {
  it("lets --apply and --reminder run only when mail goes out through Resend", () => {
    for (const flags of [
      { apply: true, reminder: false },
      { apply: false, reminder: true },
      { apply: true, reminder: true },
    ]) {
      expect(liveMailRefusal("resend", flags)).toBeNull();
      expect(liveMailRefusal("console", flags)).toMatch(/^mail mode is console; .*Nothing sent, nothing logged\.$/);
      expect(liveMailRefusal("unconfigured", flags)).toMatch(/^mail mode is unconfigured/);
    }
    expect(liveMailRefusal("console", { apply: true, reminder: true })).toContain("--reminder --apply needs resend");
  });

  it("leaves the first notice's dry run alone in any mode", () => {
    for (const mode of ["resend", "console", "unconfigured"] as const) expect(liveMailRefusal(mode, { apply: false, reminder: false })).toBeNull();
  });
});
