import { eq } from "drizzle-orm";
import Link from "next/link";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { Mark } from "@/components/Mark";
import { MobileNav } from "@/components/MobileNav";
import { AccountLink, NavLinks } from "@/components/NavLinks";
import { SiteFooter } from "@/components/SiteFooter";
import { SITE } from "@/config/site";
import { getDb } from "@/db";
import { listings } from "@/db/schema";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { ShareSheetProvider } from "@/components/share/share-sheet";
import { getSetting } from "@/server/data/settings";
import { signOutAction } from "@/server/actions/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getNames } from "@/server/data/names";
import { requireUser } from "@/server/auth";

/**
 * Everything under (app) is for signed-in people. The session check happens
 * here, on the server, on every request; src/proxy.ts only does the cheap
 * cookie-presence redirect first.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const db = await getDb();
  // Everyone has a first and last name on file before they do anything else (8 Oct 2026).
  const names = await getNames(db, user.id);
  if (!names.complete) {
    const here = (await headers()).get("x-pathname") ?? "/browse";
    redirect(`/welcome?next=${encodeURIComponent(here)}`);
  }
  const [mine] = await db.select({ id: listings.id }).from(listings).where(eq(listings.userId, user.id)).limit(1);
  const announcement = await getSetting(db, "announcement");

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="relative border-b border-line bg-paper">
        <nav className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4 md:gap-6" aria-label="Main">
          <Link href="/browse" className="inline-flex shrink-0 items-center gap-2 text-lg font-bold text-lake">
            <Mark className="h-8 w-8 md:h-9 md:w-9" /> {SITE.name}
          </Link>
          <Suspense>
            <NavLinks isAdmin={user.role === "admin"} hasListing={Boolean(mine)} />
          </Suspense>
          {/* Desktop: name and sign-out in the bar. Phone: first name and a menu button (MobileNav). */}
          <div className="ml-auto hidden items-center gap-3 text-sm md:flex">
            <Suspense>
              <AccountLink label={names.first ? `${names.first} ${names.last ?? ""}`.trim() : user.email} />
            </Suspense>
            <form action={signOutAction}>
              <button type="submit" className="link">
                Sign out
              </button>
            </form>
          </div>
          <Suspense>
            <MobileNav isAdmin={user.role === "admin"} hasListing={Boolean(mine)} name={names.first ?? user.email.split("@")[0]} signOut={signOutAction} />
          </Suspense>
        </nav>
      </header>
      <AnnouncementBanner announcement={announcement} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <ShareSheetProvider>{children}</ShareSheetProvider>
      </main>
      <SiteFooter />
    </div>
  );
}
