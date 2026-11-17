import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "./proxy";

const req = (path: string, cookie?: string) =>
  new NextRequest(new URL(path, "https://example.test"), { headers: cookie ? { cookie: `catamount.session_token=${cookie}` } : {} });

describe("proxy", () => {
  it.each(["/browse", "/map", "/listing/12", "/browse?semester=fall27"])("lets a signed-out visitor through to %s, uncached", (path) => {
    for (const r of [proxy(req(path)), proxy(req(path, "abc"))]) {
      expect(r.headers.get("location")).toBeNull();
      expect(r.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    }
  });

  it.each(["/post", "/account", "/admin", "/welcome"])("still sends a signed-out visitor from %s to sign-in", (path) => {
    const r = proxy(req(path));
    expect(r.status).toBe(307);
    expect(r.headers.get("location")).toContain(`/sign-in?next=${encodeURIComponent(path)}`);
  });

  it("leaves other pages' caching alone", () => {
    expect(proxy(req("/privacy")).headers.get("cache-control")).toBeNull();
  });
});
