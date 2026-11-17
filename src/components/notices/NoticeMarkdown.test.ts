import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NoticeMarkdown } from "./NoticeMarkdown";

/** The body as the popup sends it: rendered to HTML on the server. */
const html = (markdown: string) => renderToStaticMarkup(createElement(NoticeMarkdown, { markdown }));
/** Every tag name in the output. */
const tags = (out: string) => [...new Set([...out.matchAll(/<([a-z0-9]+)[\s>/]/g)].map((m) => m[1]))].sort();
const ALLOWED = new Set(["div", "p", "strong", "em", "a", "ul", "ol", "li", "h3", "h4", "code", "br", "hr", "blockquote", "span"]);

describe("NoticeMarkdown", () => {
  it("renders the allowed Markdown", () => {
    const out = html("### Heads up\n\n**Bold**, *em* and `code`.\n\n- one\n- two\n\n1. first\n\n> quoted\n\n---\n\nline one  \nline two");
    expect(out).toContain('<h3 class="text-base font-bold text-ink">Heads up</h3>');
    expect(out).toContain("<strong>Bold</strong>");
    expect(out).toContain("<em>em</em>");
    expect(out).toContain("<code");
    expect(out).toContain("<ul");
    expect(out).toContain("<ol");
    expect(out).toContain("<blockquote");
    expect(out).toContain("<hr");
    expect(out).toContain("<br/>");
  });

  it("drops raw HTML entirely: script, iframe, img, inline handlers, style", () => {
    const out = html(
      'Hi <script>alert(1)</script> there\n\n<img src=x onerror="alert(1)">\n\n<iframe src="https://evil.example"></iframe>\n\n<div onclick="alert(1)">click</div>\n\n<style>body{display:none}</style>\n\n<a href="javascript:alert(1)">x</a>',
    );
    expect(out).not.toMatch(/<script|<img|<iframe|<style|onerror|onclick|javascript:/i);
    for (const t of tags(out)) expect(ALLOWED).toContain(t);
  });

  it.each([
    "[x](javascript:alert(1))",
    "[x](JAVASCRIPT:alert(1))",
    "[x](java&#x73;cript:alert(1))",
    "[x](&#106;avascript:alert(1))",
    "[x](javascript&colon;alert(1))",
    "[x](<javascript:alert(1)>)",
    "<javascript:alert(1)>",
    "[x][r]\n\n[r]: javascript:alert(1)",
    "[x](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)",
    "[x](vbscript:msgbox(1))",
    "[x](//evil.example)",
  ])("strips the link in %j (any text stays plain text)", (md) => {
    const out = html(md);
    expect(out).not.toMatch(/href=/);
    expect(out).not.toMatch(/<a[\s>]/);
  });

  it("keeps a backslash path on this site (the parser percent-encodes it)", () => {
    expect(html("[x](/\\evil.example)")).toContain('href="/%5Cevil.example"');
  });

  it("drops images, keeping nothing of them", () => {
    const out = html("![alt text](https://evil.example/x.png) after");
    expect(out).not.toMatch(/<img|evil\.example/);
    expect(out).toContain("after");
  });

  it("opens external links in a new tab with noopener noreferrer, and keeps site and mailto links in place", () => {
    expect(html("[out](https://example.com)")).toContain('href="https://example.com" class="font-bold text-lake underline" target="_blank" rel="noopener noreferrer"');
    expect(html("[here](/whats-new)")).toMatch(/href="\/whats-new" class="[^"]*">here<\/a>/);
    expect(html("[mail](mailto:a@example.com)")).toMatch(/href="mailto:a@example.com" class="[^"]*">mail<\/a>/);
    expect(html("visit www.example.com")).toContain('target="_blank" rel="noopener noreferrer"');
  });

  it("turns big headings into h3 and small ones into h4, and unwraps what isn't allowed", () => {
    expect(html("# One\n\n## Two\n\n##### Five")).toMatch(/<h3[^>]*>One<\/h3>\s*<h3[^>]*>Two<\/h3>\s*<h4[^>]*>Five<\/h4>/);
    const table = html("| a | b |\n|---|---|\n| 1 | 2 |\n\n~~gone~~\n\n- [x] task\n\n```js\nconst a = 1;\n```");
    for (const t of tags(table)) expect(ALLOWED).toContain(t);
    expect(table).toContain("gone");
    expect(table).toContain("const a = 1;");
  });
});
