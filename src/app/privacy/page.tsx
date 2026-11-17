import type { Metadata } from "next";
import Link from "next/link";
import { ALLOWED_EMAIL_DOMAINS, SITE } from "@/config/site";
import { SITE_TIME_ZONE } from "@/lib/dates";

export const metadata: Metadata = { title: `Privacy · ${SITE.name}`, alternates: { canonical: "/privacy" } };

/** Bump whenever this page changes what it says. */
const LAST_UPDATED = "2026-11-16";

/** What the site keeps, who sees it, and how to get rid of it. Plain words, no legalese. */
export default function PrivacyPage() {
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
      <Link href="/" className="text-sm font-bold text-lake">
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
          {SITE.operator} may occasionally email you about this site, such as a feedback survey, or about another product it makes. Reply
          &quot;unsubscribe&quot; to stop.
        </p>
        <p>
          If you post a listing: the address and map pin, rent, semesters, description, photos, and the
          contact email and phone you give. Photos are stripped of location and other metadata when they are uploaded.
        </p>
        <p>
          Counts of how many people opened a listing, got in touch, and shared it. People are recorded as a one-way code, never by
          name or email, so no page can say who looked at what. Posters and the admin see totals only.
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
          or matched across days. Search engines and link previews are not counted.
        </p>
        <p>Page-view counts through Vercel Web Analytics, which sets no cookies and keeps no record of who you are.</p>
      </section>
      <section className="flex flex-col gap-3 text-ink-2">
        <h2 className="text-lg font-bold text-ink">Who sees it</h2>
        <p>
          Signed-in students see listings in full. Anyone can browse a listing whose poster has not kept it to signed-in students, without
          signing in: its photos, price, semester, size, utilities and amenities, how long ago it was posted, and a circle of about 150 m
          that contains the place, with the neighborhood it falls in. Never the address, the exact spot, the description, the
          poster&apos;s name or how to reach them. The public share link and its preview
          show the price, semester, size and distance from campus, nothing else.
        </p>
        <p>The site&apos;s admin can see every listing and the email addresses of people who signed in, to run the site. Nothing is sold or shared with anyone.</p>
      </section>
      <section className="flex flex-col gap-3 text-ink-2">
        <h2 className="text-lg font-bold text-ink">Getting rid of it</h2>
        <p>
          Delete your listing from your post page, or your whole account from the <Link href="/account" className="link">account page</Link>: listing, photos and account go at once, with any email the admin sent you from the site. Or email{" "}
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
