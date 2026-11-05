import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SITE } from "@/config/site";
import { getDb } from "@/db";
import { appUrl } from "@/env";
import { parseShareSlug, shareSlug } from "@/lib/share";
import { resolveShare, type ShareResolution } from "@/server/data/share";
import { log } from "@/server/log";

/**
 * Where a share link lands. Crawlers read this page without a session, so
 * it carries the preview meta tags; a person gets a sign-in button that
 * comes back to the listing. The database may be down: that renders the
 * same "unavailable" page as a bad link, never a 500 (a crawler caches the
 * absence of a preview).
 */

const SIGN_IN = (id: number) => `/sign-in?next=${encodeURIComponent(`/browse?id=${id}&via=share`)}`;

async function resolve(slug: string): Promise<ShareResolution> {
  const parsed = parseShareSlug(slug);
  if (!parsed) return { state: "unavailable" };
  try {
    return await resolveShare(await getDb(), parsed.id, parsed.token);
  } catch (error) {
    log.error("share.resolve_failed", error);
    return { state: "unavailable" };
  }
}

function cardUrl(r: Extract<ShareResolution, { state: "open" }>): string {
  return `${appUrl()}/share-card/${shareSlug(r.id)}/og?v=${r.fingerprint}`;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const r = await resolve(slug);
  const base = { robots: { index: false, follow: false }, openGraph: { type: "website", siteName: SITE.name } } as const;
  if (r.state === "open") {
    const image = cardUrl(r);
    return {
      ...base,
      title: r.lines.title,
      description: r.lines.description,
      openGraph: { ...base.openGraph, title: r.lines.title, description: r.lines.description, url: `${appUrl()}/s/${shareSlug(r.id)}`, images: [{ url: image, width: 1200, height: 630, type: "image/png" }] },
      twitter: { card: "summary_large_image", title: r.lines.title, description: r.lines.description, images: [image] },
    };
  }
  const title = r.state === "taken" ? `This sublet has been taken — ${SITE.name}` : `Listing unavailable — ${SITE.name}`;
  const description = r.state === "taken" ? `Whoever posted it has found someone. Other sublets are still up on ${SITE.name}.` : "This sublet listing is no longer available.";
  const image = `${appUrl()}/og-default.png`;
  return {
    ...base,
    title,
    description,
    openGraph: { ...base.openGraph, title, description, url: SITE.url, images: [{ url: image, width: 1200, height: 630, type: "image/png" }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function SharePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const r = await resolve(slug);
  if (r.state === "unavailable") notFound();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center gap-6 px-4 py-10">
      <div className="overflow-hidden rounded-xl border border-line bg-paper shadow-sm">
        {r.state === "open" && (
          // The same bytes the og:image tag points at, so showing it here exposes nothing the preview has not.
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={cardUrl(r)} alt={r.lines.title} width={1200} height={630} className="block w-full" />
        )}
        <div className="flex flex-col gap-3 p-6">
          {r.state === "open" ? (
            <>
              <h1 className="text-2xl font-bold">Someone shared a sublet with you</h1>
              <p className="text-ink-2">Sign in to see the address, photos and how to get in touch.</p>
              <SignInLink href={SIGN_IN(r.id)} />
              <p className="text-xs text-ink-3">The address and contact details are only shown to signed-in students.</p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold">This sublet has been taken</h1>
              <p className="text-ink-2">Whoever posted it has found someone. Other sublets are still up on the site.</p>
              <Link href="/browse" className="btn-primary self-start">
                Browse sublets
              </Link>
            </>
          )}
        </div>
      </div>
      <p className="text-center text-xs leading-5 text-ink-3">
        <Link href="/" className="font-bold text-lake">
          {SITE.name}
        </Link>{" "}
        ·{" "}
        <a href={SITE.instagramUrl} className="font-bold text-lake">
          {SITE.instagramHandle}
        </a>
        <br />
        {SITE.disclaimer}
      </p>
    </main>
  );
}

function SignInLink({ href }: { href: string }) {
  return (
    <a href={href} className="btn-primary self-start">
      Sign in with your student email
    </a>
  );
}
