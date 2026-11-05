import type { Metadata } from "next";
import Link from "next/link";
import { ALLOWED_EMAIL_DOMAINS, SITE } from "@/config/site";
import { SITE_TIME_ZONE } from "@/lib/dates";

export const metadata: Metadata = { title: `Privacy · ${SITE.name}`, alternates: { canonical: "/privacy" } };

/** Bump whenever this page changes what it says. */
const LAST_UPDATED = "2026-11-02";

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
          If you ask us to add your school or to let you in: the name, email address and message you send, kept until we&apos;ve
          answered and used only to reply.
        </p>
        <p>If you answer the feedback survey: your answers, kept with your account and deleted with it.</p>
        <p>Page-view counts through Vercel Web Analytics, which sets no cookies and keeps no record of who you are.</p>
      </section>
      <section className="flex flex-col gap-3 text-ink-2">
        <h2 className="text-lg font-bold text-ink">Who sees it</h2>
        <p>Signed-in students see listings in full. The public share link and its preview show the price, semester, size and distance from campus, nothing else.</p>
        <p>The site&apos;s admin can see every listing and the email addresses of people who signed in, to run the site. Nothing is sold or shared with anyone.</p>
      </section>
      <section className="flex flex-col gap-3 text-ink-2">
        <h2 className="text-lg font-bold text-ink">Getting rid of it</h2>
        <p>
          Delete your listing from your post page, or your whole account from the <Link href="/account" className="link">account page</Link>: listing, photos and account go at once. Or email{" "}
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
