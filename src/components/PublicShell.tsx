import Link from "next/link";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { Mark } from "@/components/Mark";
import { PublicNav } from "@/components/PublicNav";
import { SiteFooter } from "@/components/SiteFooter";
import { SITE } from "@/config/site";

/**
 * The board's frame for a signed-out visitor: the name, Browse and Map, and
 * Sign in (coming back to the page they were on). Nothing in it reads a
 * session or a listing.
 */
export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="relative border-b border-line bg-paper">
        <nav className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4 md:gap-6" aria-label="Main">
          <Link href="/" className="inline-flex shrink-0 items-center gap-2 text-lg font-bold text-lake">
            <Mark className="h-8 w-8 md:h-9 md:w-9" /> <span className="hidden sm:inline">{SITE.name}</span>
          </Link>
          <Suspense>
            <PublicNav />
          </Suspense>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
      <SiteFooter />
    </div>
  );
}
