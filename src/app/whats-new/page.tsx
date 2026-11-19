import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { MarkWhatsNewSeen } from "@/components/WhatsNew";
import { SITE } from "@/config/site";
import { CHANGELOG } from "@/content/changelog";
import { backHref } from "@/lib/back-link";
import { easternDate, SITE_TIME_ZONE } from "@/lib/dates";
import { latestMarker, shownEntries } from "@/lib/whats-new";

export const metadata: Metadata = {
  title: `What's new · ${SITE.name}`,
  description: `What's changed on ${SITE.name}, newest first.`,
  alternates: { canonical: "/whats-new" },
};

const longDate = (date: string) =>
  // Noon UTC is the same calendar day in Eastern time.
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: SITE_TIME_ZONE, month: "long", day: "numeric", year: "numeric" });

/**
 * What's new: src/content/changelog.ts, newest first, only entries due by
 * today (Eastern). Rendered per request: an entry dated tomorrow appears at
 * midnight, and the page's scripts carry the CSP nonce (src/proxy.ts), which
 * a prerendered page's would not, so MarkWhatsNewSeen runs.
 */
export default async function WhatsNewPage({ searchParams }: { searchParams: Promise<{ from?: string | string[] }> }) {
  await connection();
  const { from } = await searchParams;
  const today = easternDate(new Date());
  const entries = shownEntries(CHANGELOG, today);
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <Link href={backHref(from)} className="text-sm font-bold text-lake">
        ← {SITE.name}
      </Link>
      <h1 className="text-3xl font-bold">What&apos;s new</h1>
      <ol className="flex flex-col gap-6">
        {entries.map((e) => (
          <li key={`${e.date} ${e.title}`} className="flex flex-col gap-1.5 border-t border-line pt-5 first:border-t-0 first:pt-0">
            <time dateTime={e.date} className="text-sm text-ink-3">
              {longDate(e.date)}
            </time>
            <h2 className="text-lg font-bold">{e.title}</h2>
            <p className="text-ink-2">{e.body}</p>
            {e.link && (
              <Link href={e.link.href} className="link self-start text-sm font-bold">
                {e.link.label} →
              </Link>
            )}
          </li>
        ))}
      </ol>
      <MarkWhatsNewSeen latest={latestMarker(CHANGELOG, today)} />
    </main>
  );
}
