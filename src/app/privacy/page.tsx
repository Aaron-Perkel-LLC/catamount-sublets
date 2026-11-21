import type { Metadata } from "next";
import Link from "next/link";
import { ALLOWED_EMAIL_DOMAINS, SITE } from "@/config/site";
import { backHref } from "@/lib/back-link";
import { SITE_TIME_ZONE } from "@/lib/dates";

export const metadata: Metadata = { title: `Privacy · ${SITE.name}`, alternates: { canonical: "/privacy" } };

/** Bump whenever this page changes what it says. */
const LAST_UPDATED = "2026-11-21";

/** What the site keeps, who sees it, and how to get rid of it. Plain words, no legalese. */
export default async function PrivacyPage({ searchParams }: { searchParams: Promise<{ from?: string | string[] }> }) {
  const { from } = await searchParams;
  const domains = ALLOWED_EMAIL_DOMAINS.map((d) => `@${d}`).join(" or ");
  // Noon UTC is the same calendar day in Eastern time.
  const lastUpdated = new Date(`${LAST_UPDATED}T12:00:00Z`).toLocaleDateString("en-US", {
    timeZone: SITE_TIME_ZONE,
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <Link href={backHref(from)} className="text-sm font-bold text-lake">
        ← {SITE.name}
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold">Privacy</h1>
        <p className="text-sm text-ink-3">
          Last updated <time dateTime={LAST_UPDATED}>{lastUpdated}</time>
        </p>
      </div>
      <section className="flex flex-col gap-3 text-ink-2">
        <h2 className="text-lg font-bold text-ink">Who runs this site</h2>
        <p>
          {SITE.name} is operated by {SITE.operator}, {SITE.operatorKind} doing business as {SITE.name} (registered assumed
          name). {SITE.operatorLocation}. Contact:{" "}
          <a href={`mailto:${SITE.supportEmail}`} className="link">
            {SITE.supportEmail}
          </a>
          .
        </p>
        <p className="text-sm text-ink-3">{SITE.disclaimer}</p>
      </section>
      <section className="flex flex-col gap-3 text-ink-2">
        <h2 className="text-lg font-bold text-ink">What we keep</h2>
        <p>Your {domains} email address, used to sign you in with a one-time code. No password is ever stored.</p>
        <p>
          {SITE.operator} may occasionally email you about this site, such as a feedback survey, or about another product it makes. Every
          email like that has an unsubscribe link, and one click stops them all. Sign-in codes still come, because you ask for those.
        </p>
        <p>
          A record of each email the admin sends you from the site: what it said, when, and whether it arrived. If you unsubscribe, that
          and the date are kept so you are not emailed again.
        </p>
        <p>
          If you post a listing: the address and map pin, rent, semesters, description, photos, and the
          contact email and phone you give. Photos are stripped of location and other metadata when they are uploaded.
        </p>
        <p>
          Counts of how many people opened a listing, got in touch, and shared it. People are recorded as a one-way code, never by
          name or email, so no page can say who looked at what. Posters and the admin see totals only. These records are kept after the
          listing or your account is gone (the listing&apos;s number and the one-way code, no name or email), so the totals add up.
        </p>
        <p>
          If you ask us to add your school or to let you in: the name, email address and message you send, and our reply. Both are kept
          as a record of the conversation and used for nothing else. Anyone can ask for them to be deleted: email{" "}
          <a href={`mailto:${SITE.supportEmail}`} className="link">
            {SITE.supportEmail}
          </a>
          .
        </p>
        <p>If you answer the feedback survey: your answers, kept with your account and deleted with it.</p>
        <p>
          If you save a search and turn on the weekly email: the search&apos;s filters and name, whether the email is on, and for each week how
          many listings it held and whether it went (not which listings). All of it is kept with your account and deleted with it. Turn the
          email off from your account page or with the unsubscribe link in any of them.
        </p>
        <p>
          If you say whether you found a subletter (when you delete your listing, or from an email asking before your semester ends): that
          answer, stored against the listing&apos;s number only, without your name or the listing&apos;s details. It is kept after the listing is
          gone, so the totals add up.
        </p>
        <p>
          When someone who is not signed in opens a listing, the view is counted under a code made from their IP address and browser
          name with a secret that changes every day. The IP address itself is never stored, and the code cannot be turned back into it
          or matched across days. Arriving at a listing from a share link without being signed in is counted the same way, under that
          day&apos;s code, with no name or email. Search engines and link previews are not counted.
        </p>
        <p>Page-view counts through Vercel Web Analytics, which sets no cookies and keeps no record of who you are.</p>
      </section>
      <section className="flex flex-col gap-3 text-ink-2">
        <h2 className="text-lg font-bold text-ink">Who sees it</h2>
        <p>Signed-in students see listings in full.</p>
        <p>
          Anyone can see a listing without signing in, unless it is kept to signed-in students. They see its photos, the rent and whether
          it is negotiable, the semesters, its size (bedrooms, bathrooms and how many roommates), who pays for which utilities and the
          estimated monthly cost if the poster gave one, its amenities, how long ago it was posted, and a circle of about 150 m that
          contains the place, with the neighborhood the circle falls in and its distance from campus. Never the address, the exact spot,
          the description, the poster&apos;s name or how to reach them: those are shown only to signed-in students.
        </p>
        <p>
          Search engines can list those public listings. Each one is in the site&apos;s sitemap and may turn up in search results, showing
          only what is listed above. A listing that is paused, taken, deleted or kept to signed-in students leaves the sitemap at once; a
          search engine&apos;s own copy can take longer to go.
        </p>
        <p>
          Every listing is public in this way, and its poster has no switch to change that: only the site&apos;s admin can keep one to
          signed-in students, so email{" "}
          <a href={`mailto:${SITE.supportEmail}`} className="link">
            {SITE.supportEmail}
          </a>{" "}
          to ask.
        </p>
        <p>
          A share link and its preview show the listing&apos;s first photo, the price and whether it is negotiable, the semester, size and
          distance from campus, nothing else. That is true of any listing that is up, including one kept to signed-in students.
        </p>
        <p>The site&apos;s admin can see every listing and the email addresses of people who signed in, to run the site. Nothing is sold or shared with anyone.</p>
      </section>
      <section className="flex flex-col gap-3 text-ink-2">
        <h2 className="text-lg font-bold text-ink">Getting rid of it</h2>
        <p>
          Delete your listing from your post page, or your whole account from the <Link href="/account" className="link">account page</Link>: listing, photos and account go at once, with any email the admin wrote to you alone (the activity records above stay, with no name or email, and so does the fact that an email sent to a group reached one more person, without your address or name). Or email{" "}
          <a href={`mailto:${SITE.supportEmail}`} className="link">
            {SITE.supportEmail}
          </a>{" "}
          and it will be done for you.
        </p>
      </section>
      <section className="flex flex-col gap-3 text-ink-2">
        <h2 className="text-lg font-bold text-ink">Where it lives</h2>
        <p>The site runs on Vercel, the database on Neon, photos on Vercel Blob, and sign-in codes go out through Resend. Each is a hosting provider; none of them uses your data for anything else.</p>
      </section>
    </main>
  );
}
