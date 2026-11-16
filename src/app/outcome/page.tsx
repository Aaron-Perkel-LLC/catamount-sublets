import type { Metadata } from "next";
import Link from "next/link";
import { OutcomeAnswer } from "@/components/OutcomeAnswer";
import { SITE } from "@/config/site";
import { getDb } from "@/db";
import { EMAIL_ANSWER_VALUES, type EmailAnswer } from "@/lib/listing-outcome";
import { outcomePageState } from "@/server/services/listing-outcome";
import { OUTCOME_TOKEN_DAYS } from "@/server/outcome-token";

export const metadata: Metadata = { title: `Your listing · ${SITE.name}`, robots: { index: false, follow: false } };

const AUTHOR = SITE.author.split(" ")[0];

/**
 * Where the "still available?" email's links land. Opening it changes
 * nothing, even with JavaScript running (link scanners run it): ?a= only
 * pre-selects that answer, and the poster's tap on it (see OutcomeAnswer)
 * is the POST that records it and acts on the listing.
 * No session, and the listing may already be gone.
 */
export default async function OutcomePage({ searchParams }: { searchParams: Promise<{ t?: string; a?: string }> }) {
  const { t, a } = await searchParams;
  const token = typeof t === "string" ? t : "";
  const page = await outcomePageState(await getDb(), token);

  if (page.state === "invalid") {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-4 py-10">
        <h1 className="text-2xl font-bold">This link isn&apos;t valid</h1>
        <p className="text-ink-2">
          These links work for {OUTCOME_TOKEN_DAYS} days from the email. Reply to that email instead and {AUTHOR} will note your answer.
        </p>
        <div className="flex gap-3">
          <a href={`mailto:${SITE.supportEmail}`} className="btn-primary">
            Email {AUTHOR}
          </a>
          <Link href="/" className="btn-secondary">
            Front page
          </Link>
        </div>
      </main>
    );
  }

  const chosen = (EMAIL_ANSWER_VALUES as readonly string[]).includes(a ?? "") ? (a as EmailAnswer) : null;
  const current = page.current && (EMAIL_ANSWER_VALUES as readonly string[]).includes(page.current) ? (page.current as EmailAnswer) : null;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-6 px-4 py-10">
      <Link href="/" className="text-sm font-bold text-lake">
        ← {SITE.name}
      </Link>
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">Did you find a subletter?</h1>
        <p className="text-ink-2">
          Filled marks your listing as taken, which you can undo from My post. Still available puts today&apos;s date on it. Taking it down
          only records your answer; it comes down when the semester is archived, or delete it yourself from My post.
        </p>
      </div>
      <OutcomeAnswer token={token} chosen={chosen} current={current} />
      <p className="text-xs leading-5 text-ink-3">
        Stored against the listing&apos;s number only, never your name or the listing&apos;s details, and kept after the listing is gone so the totals add up. <Link href="/privacy" className="link">Privacy</Link>
      </p>
    </main>
  );
}
