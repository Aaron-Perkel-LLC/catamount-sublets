import type { Metadata } from "next";
import Link from "next/link";
import { UnsubscribeConfirm } from "@/components/UnsubscribeConfirm";
import { SITE } from "@/config/site";
import { getDb } from "@/db";
import { unsubscribePageState } from "@/server/services/digest";

export const metadata: Metadata = { title: `Unsubscribe · ${SITE.name}`, robots: { index: false, follow: false } };

/**
 * Where the weekly email's visible "Unsubscribe" link lands. The GET only
 * shows the confirm button: mail scanners open every link in a message, so
 * opening this page must change nothing. The button's POST unsubscribes, as
 * does the RFC 8058 one-click POST to /api/digest/unsubscribe. No session.
 */
export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  const token = typeof t === "string" ? t : "";
  const page = await unsubscribePageState(await getDb(), token);

  if (page.state === "invalid") {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-4 py-10">
        <h1 className="text-2xl font-bold">This link isn&apos;t valid</h1>
        <p className="text-ink-2">
          Sign in and turn the weekly email off under Account, or reply to the email and it&apos;ll be done by hand.
        </p>
        <div className="flex gap-3">
          <Link href="/account#alerts" className="btn-primary">
            Account
          </Link>
          <a href={`mailto:${SITE.supportEmail}?subject=unsubscribe`} className="btn-secondary">
            Email us
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-6 px-4 py-10">
      <Link href="/" className="text-sm font-bold text-lake">
        ← {SITE.name}
      </Link>
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">Stop the weekly email?</h1>
        <p className="text-ink-2">
          You&apos;ll stop getting new listings that match your saved searches. Your searches stay saved, and you can turn the email back on
          from Account.
        </p>
      </div>
      <UnsubscribeConfirm token={token} alreadyOff={!page.enabled} />
    </main>
  );
}
