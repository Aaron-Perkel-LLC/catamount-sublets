import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NameForm } from "@/components/account/NameForm";
import { Mark } from "@/components/Mark";
import { SITE } from "@/config/site";
import { getDb } from "@/db";
import { safeNext } from "@/lib/safe-next";
import { signOutAction } from "@/server/actions/auth";
import { requireUser } from "@/server/auth";
import { getNames } from "@/server/data/names";

export const metadata: Metadata = { title: `Your name · ${SITE.name}` };

/**
 * Asked once, right after the first sign-in, of everyone without a first and
 * last name on file: new accounts and migrated ones alike. Lives outside the
 * (app) layout, whose gate sends people here.
 */
export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const user = await requireUser("/welcome");
  const next = safeNext((await searchParams).next, "/browse");
  const names = await getNames(await getDb(), user.id);
  if (names.complete) redirect(next === "/welcome" ? "/browse" : next);
  const migrated = Boolean(user.legacyNetid);
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <p className="inline-flex items-center gap-2 text-lg font-bold text-lake">
        <Mark className="h-9 w-9" /> {SITE.name}
      </p>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-ink">{migrated ? "Welcome back. One thing first." : "Welcome. One thing first."}</h1>
        <p className="text-ink-2">
          {migrated
            ? `Your listing came over from the old site. Before you carry on, tell us your name; ${SITE.name} now asks everyone.`
            : "Tell us your name. It shows on your listing if you post one; the admin sees it with your email."}
        </p>
      </div>
      <NameForm initial={names.prefill} next={next} submitLabel="Continue" />
      {/* A div, not a p: a form can't sit inside a paragraph, and React refuses to hydrate one that does. */}
      <div className="flex flex-wrap items-baseline gap-x-1 text-xs text-ink-3">
        <span>Signed in as {user.email}.</span>
        <form action={signOutAction}>
          <button type="submit" className="link">
            Not you? Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
