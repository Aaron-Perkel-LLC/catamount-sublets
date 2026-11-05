import type { Metadata } from "next";
import Link from "next/link";
import { ACCESS, ALLOWED_EMAIL_DOMAINS, SITE } from "@/config/site";
import { getDb } from "@/db";
import { landingBoard, type LandingBoard } from "@/server/data/landing";
import { log } from "@/server/log";
import { Mark } from "@/components/Mark";
import { SiteFooter } from "@/components/SiteFooter";

export const revalidate = 60;

export const metadata: Metadata = {
  title: SITE.name,
  description: SITE.description,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: SITE.name,
    title: SITE.name,
    description: SITE.description,
    url: SITE.url,
    images: [{ url: `${SITE.url}/og-default.png`, width: 1200, height: 630 }],
  },
  twitter: { card: "summary_large_image", title: SITE.name, description: SITE.description, images: [`${SITE.url}/og-default.png`] },
};

/** Tells Google the site's name for search results (schema.org WebSite on the home page). */
const WEBSITE_JSON_LD = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE.name,
  url: `${SITE.url}/`,
}).replace(/</g, "\\u003c");

/**
 * The front page: the pitch, a board of what is up right now, and the two
 * sides of a sublet. It must render through a database outage, so the board
 * is best-effort.
 */
export default async function LandingPage({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const { deleted } = await searchParams;
  let board: LandingBoard = { thumbs: [], count: 0, semesters: "" };
  try {
    board = await landingBoard(await getDb());
  } catch (error) {
    log.error("landing.board_failed", error);
  }
  const domains = ALLOWED_EMAIL_DOMAINS.map((d) => `@${d}`).join(" or ");

  return (
    <div className="flex min-h-dvh flex-col">
      {/* A data block, not a script: the CSP does not apply to it. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: WEBSITE_JSON_LD }} />
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-5">
        <Link href="/" className="inline-flex items-center gap-2 text-lg font-bold text-lake">
          <Mark className="h-9 w-9" /> {SITE.name}
        </Link>
        <Link href="/sign-in" className="btn-secondary py-2">
          Sign in
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-14 px-4 pb-16">
        {deleted && (
          <p role="status" className="rounded-lg border border-included-line bg-included-tint px-3 py-2 text-sm text-included-ink">
            Your account and listing are gone. Thanks for using the site.
          </p>
        )}
        <section className="grid items-center gap-10 pt-6 md:grid-cols-[1.1fr_1fr]">
          <div className="flex flex-col gap-5">
            <h1 className="text-4xl leading-tight font-bold text-ink sm:text-5xl">Sublets near campus, in one place.</h1>
            <p className="text-lg text-ink-2">
              Students post the place they&apos;re leaving for a semester; students looking for one browse by price, semester and
              distance from campus, then email or call. No fees, no ads, no brokers.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/sign-in?next=%2Fbrowse" className="btn-primary px-5 py-3">
                Browse sublets
              </Link>
              <Link href="/sign-in?next=%2Fpost" className="btn-secondary px-5 py-3">
                Post yours
              </Link>
            </div>
            <p className="text-sm text-ink-3">Sign in with a code sent to your {domains} address. No password, nothing to install.</p>
            {/* Right under the sign-in line, so nobody without the address scrolls past the board to find out. */}
            <div className="rounded-xl border border-notice-line bg-notice-tint px-4 py-3 text-sm text-ink-2">
              <p>
                <strong className="text-ink">For {ACCESS.audience} only, for now.</strong> Want {SITE.name} at your school, or have a good
                reason to be let in, like a recent grad with a room to sublet?
              </p>
              <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                <Link href="/request?kind=school" className="link">
                  Request your school →
                </Link>
                <Link href="/request?kind=access" className="link">
                  Request access →
                </Link>
              </p>
            </div>
          </div>
          <Board board={board} />
        </section>

        <section className="grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-line bg-paper p-6">
            <h2 className="text-xl font-bold">Looking for a place</h2>
            <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-ink-2">
              <li>
                Every listing has the same facts: rent, semester, bedrooms, bathrooms, roommates, utilities, amenities, and how far it
                is from campus.
              </li>
              <li>Filter and sort by what matters to you, or see everything on a map.</li>
              <li>Every poster signed in with a verified student email. Email or call them straight from the listing.</li>
            </ul>
          </div>
          <div className="rounded-2xl border border-line bg-paper p-6">
            <h2 className="text-xl font-bold">Leaving for a semester</h2>
            <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-ink-2">
              <li>One form, a few photos, and your place is on the board for the semesters you pick.</li>
              <li>Share it to a story or a group chat with a link that shows the price and distance, never your address.</li>
              <li>
                Pause it, mark it taken, or take it down whenever you like. You see how many people looked and got in touch, never
                who.
              </li>
            </ul>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

/** The board: a grid of current covers with the live count, or a quiet card when the board is empty. */
function Board({ board }: { board: LandingBoard }) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-lake p-4 shadow-lg">
      {board.thumbs.length > 0 ? (
        <div className="grid grid-cols-3 gap-2">
          {board.thumbs.slice(0, 9).map((t, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={t} alt="" className="aspect-square w-full rounded-lg object-cover" loading={i < 3 ? "eager" : "lazy"} />
          ))}
        </div>
      ) : (
        <div className="flex aspect-[4/3] items-center justify-center text-paper/80">Nothing on the board yet.</div>
      )}
      <div className="absolute bottom-4 left-4 rounded-full bg-maple px-3 py-1 text-sm font-bold text-paper shadow">
        {board.count} listing{board.count === 1 ? "" : "s"} up now{board.semesters ? ` · ${board.semesters}` : ""}
      </div>
    </div>
  );
}
