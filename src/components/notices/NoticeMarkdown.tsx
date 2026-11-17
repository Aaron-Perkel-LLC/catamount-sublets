import type { ComponentProps } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { isExternalHref, safeBodyHref } from "@/lib/notices";

/**
 * A notice body: Markdown with no raw HTML (skipHtml drops it, and there is
 * no rehype-raw), only the elements below (anything else is replaced by its
 * children, so a table or an image leaves at most its text), and links only
 * to http(s), mailto or a path on this site. No hooks, so it renders on the
 * server for the popup and on the client for the admin preview, identically.
 */
export const NOTICE_ELEMENTS = ["p", "strong", "em", "a", "ul", "ol", "li", "h3", "h4", "code", "br", "hr", "blockquote"];

interface HastNode {
  type: string;
  tagName?: string;
  children?: HastNode[];
}

/** # and ## become h3, ##### and ###### h4: a heading keeps being a heading at the levels a popup allows. */
function headingLevels() {
  const map: Record<string, string> = { h1: "h3", h2: "h3", h5: "h4", h6: "h4" };
  const walk = (node: HastNode) => {
    if (node.type === "element" && node.tagName && map[node.tagName]) node.tagName = map[node.tagName];
    node.children?.forEach(walk);
  };
  return (tree: HastNode) => walk(tree);
}

function NoticeLink({ href, children }: ComponentProps<"a">) {
  if (!href) return <span>{children}</span>;
  const external = isExternalHref(href);
  return (
    <a href={href} className="font-bold text-lake underline" {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
      {children}
    </a>
  );
}

const components: Components = {
  a: NoticeLink,
  ul: ({ children }) => <ul className="list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5">{children}</ol>,
  h3: ({ children }) => <h3 className="text-base font-bold text-ink">{children}</h3>,
  h4: ({ children }) => <h4 className="text-sm font-bold text-ink">{children}</h4>,
  code: ({ children }) => <code className="rounded bg-line-light px-1 py-0.5 text-[0.9em]">{children}</code>,
  hr: () => <hr className="border-line" />,
  blockquote: ({ children }) => <blockquote className="border-l-4 border-line pl-3 text-ink-2">{children}</blockquote>,
};

export function NoticeMarkdown({ markdown }: { markdown: string }) {
  return (
    <div className="flex flex-col gap-3 text-sm leading-6 text-ink-2">
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[headingLevels]}
        allowedElements={NOTICE_ELEMENTS}
        unwrapDisallowed
        skipHtml
        urlTransform={(url) => safeBodyHref(url)}
        components={components}
      >
        {markdown}
      </Markdown>
    </div>
  );
}
