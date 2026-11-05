import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Mark } from "@/components/Mark";
import { ALLOWED_EMAIL_DOMAINS, SITE } from "@/config/site";
import { safeNext } from "@/lib/safe-next";
import { getSessionUser } from "@/server/auth";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: `Sign in · ${SITE.name}`, alternates: { canonical: "/sign-in" } };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const target = safeNext(next);
  if (await getSessionUser()) redirect(target);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <Link href="/" className="mb-8 inline-flex items-center gap-2 self-start text-lg font-bold text-lake">
        <Mark className="h-9 w-9" /> {SITE.name}
      </Link>
      <SignInForm next={target} />
      <p className="mt-6 text-sm text-ink-2">
        No {ALLOWED_EMAIL_DOMAINS.map((d) => `@${d}`).join(" or ")} address?{" "}
        <Link href="/request?kind=access" className="link">
          Request access
        </Link>
      </p>
      <p className="mt-10 text-xs leading-5 text-ink-3">{SITE.disclaimer}</p>
    </main>
  );
}
