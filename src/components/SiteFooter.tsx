import Link from "next/link";
import { SITE } from "@/config/site";
import { easternYear } from "@/lib/dates";

/**
 * The footer on the front page and every signed-in page, in two lines: the
 * copyright with the contact and privacy links, then the disclaimer. What is
 * counted and who sees it is on the privacy page.
 */
export function SiteFooter() {
  const link = "font-bold text-lake hover:underline";
  return (
    <footer className="border-t border-line px-4 py-6 text-center text-xs leading-5 text-ink-3">
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-1.5">
        <p className="flex flex-wrap items-center justify-center gap-x-1.5">
          <span>
            {SITE.name} · © {easternYear()}{" "}
            <a href={SITE.operatorUrl} className={link}>
              {SITE.operator}
            </a>
          </span>
          {/* On a phone the links wrap as one pair under the copyright, not one word at a time. */}
          <span aria-hidden className="hidden sm:inline">
            ·
          </span>
          <span className="whitespace-nowrap">
            <a href={`mailto:${SITE.supportEmail}`} className={link}>
              Contact
            </a>{" "}
            ·{" "}
            <Link href="/privacy" className={link}>
              Privacy
            </Link>
          </span>
        </p>
        <p>{SITE.disclaimer}</p>
      </div>
    </footer>
  );
}
