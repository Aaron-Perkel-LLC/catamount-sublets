import { eq } from "drizzle-orm";
import Link from "next/link";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { Mark } from "@/components/Mark";
import { MobileNav } from "@/components/MobileNav";
import { NoticePopup } from "@/components/notices/NoticeDialog";
import { NoticeMarkdown } from "@/components/notices/NoticeMarkdown";
import { AccountLink, NavLinks } from "@/components/NavLinks";
import { ShareSheetProvider } from "@/components/share/share-sheet";
import { SiteFooter } from "@/components/SiteFooter";
import { SITE } from "@/config/site";
import { getDb } from "@/db";
import { listings } from "@/db/schema";
import { signOutAction } from "@/server/actions/auth";
import type { SessionUser } from "@/server/auth";
import { getNames } from "@/server/data/names";
import { noticeFor } from "@/server/data/notices";
import { log } from "@/server/log";
import { getSetting } from "@/server/data/settings";

/**
 * The signed-in frame: the welcome-name gate, the header with the person's
 * links, the announcement, the share sheet, and any popup notice for them. Used by (app), which
 * requires a session, and by (board) when there is one.
 */
export async function AppShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  const db = await getDb();
  // Everyone has a first and last name on file before they do anything else (8 Oct 2026).
  const names = await getNames(db, user.id);
  if (!names.complete) {
    const here = (await headers()).get("x-pathname") ?? "/browse";
    redirect(`/welcome?next=${encodeURIComponent(here)}`);
  }
  const [mine] = await db.select({ id: listings.id }).from(listings).where(eq(listings.userId, user.id)).limit(1);
  const announcement = await getSetting(db, "announcement");
  // Only a notice whose audience takes this person in is ever sent (rendered here, on the server).
  const notice = await noticeFor(db, { kind: "signed-in", userId: user.id, hasListing: Boolean(mine) }).catch((e: unknown) => {
    log.error("notice.lookup_failed", e); // best effort: a broken popup never takes the page down
    return null;
  });

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
      {notice && (
        <NoticePopup notice={notice} signedIn>
          <NoticeMarkdown markdown={notice.bodyMd} />
        </NoticePopup>
      )}
    </div>
  );
}
