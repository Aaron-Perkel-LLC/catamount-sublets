import type { Metadata } from "next";
import Link from "next/link";
import { RequestForm } from "@/components/RequestForm";
import { ACCESS, SITE } from "@/config/site";
import { ACCESS_REQUEST_KINDS, type AccessRequestKind } from "@/lib/access-request";

export const metadata: Metadata = { title: `Request access · ${SITE.name}`, robots: { index: false, follow: false } };

/** The two front-page asks, one form: add a school, or let one person in. No account needed. */
export default async function RequestPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { kind } = await searchParams;
  const initial: AccessRequestKind = ACCESS_REQUEST_KINDS.includes(kind as AccessRequestKind) ? (kind as AccessRequestKind) : "school";
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-6 px-4 py-10">
      <Link href="/" className="text-sm font-bold text-lake">
        ← {SITE.name}
      </Link>
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">Ask to get in</h1>
        <p className="text-ink-2">
          {SITE.name} is for {ACCESS.audience} right now. Ask us to add your school, or make the case for an account of your own: a
          recent grad still subletting, say. A person reads every request and replies by email.
        </p>
      </div>
      <RequestForm initialKind={initial} />
      <p className="text-xs leading-5 text-ink-3">
        We keep what you send until we&apos;ve answered it, and use your email only to reply. <Link href="/privacy" className="link">Privacy</Link>
      </p>
    </main>
  );
}
