import type { Metadata } from "next";
import Link from "next/link";
import { SurveyForm } from "@/components/SurveyForm";
import { SITE } from "@/config/site";
import { getDb } from "@/db";
import { shortDate } from "@/lib/dates";
import { surveyPageState } from "@/server/services/survey";
import { SURVEY_TOKEN_DAYS } from "@/server/survey-token";

export const metadata: Metadata = { title: `Survey · ${SITE.name}`, robots: { index: false, follow: false } };

const AUTHOR = SITE.author.split(" ")[0];

/**
 * The feedback survey, reached only through the signed link in the
 * invitation: no account page links here and no session is needed, so
 * answering costs nobody a sign-in code. A link that fails to verify gets
 * the same page whether it is forged, expired or for a banned account.
 */
export default async function SurveyPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  const token = typeof t === "string" ? t : "";
  const page = await surveyPageState(await getDb(), token);

  if (page.state === "invalid") {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-4 py-10">
        <h1 className="text-2xl font-bold">This link isn&apos;t valid</h1>
        <p className="text-ink-2">
          Survey links are personal and work for {SURVEY_TOKEN_DAYS} days. Open the one in your email again, or reply to that email and{" "}
          {AUTHOR} will send a fresh one.
        </p>
        <div className="flex gap-3">
          <a href={`mailto:${SITE.supportEmail}`} className="btn-primary">
            Email {AUTHOR}
          </a>
          <Link href="/" className="btn-secondary">
            Front page
          </Link>
        </div>
        <p className="text-xs text-ink-3">{SITE.disclaimer}</p>
      </main>
    );
  }

  const { existing, firstName } = page;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-6 px-4 py-10">
      <Link href="/" className="text-sm font-bold text-lake">
        ← {SITE.name}
      </Link>
      <div className="flex flex-col gap-2">
        <p className="text-xs font-bold tracking-wide text-ink-3 uppercase">Quick survey</p>
        <h1 className="text-3xl font-bold">How did it go{firstName ? `, ${firstName}` : ""}?</h1>
        <p className="text-ink-2">
          About ten questions, two minutes. Only the two marked required are required. Your answers go straight to {AUTHOR} and are tied to
          your account, so he can follow up if you say that&apos;s OK.
        </p>
      </div>
      <SurveyForm token={token} initial={existing} answeredOn={existing ? shortDate(existing.answeredAt) : null} />
      <p className="text-xs leading-5 text-ink-3">
        Answers are kept with your account and deleted with it. Nobody but the site&apos;s admin sees them. <Link href="/privacy" className="link">Privacy</Link>
      </p>
    </main>
  );
}
