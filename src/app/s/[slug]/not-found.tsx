import Link from "next/link";
import { SITE } from "@/config/site";

/** One page for a bad token, an unknown id, a hidden or paused listing and an outage. */
export default function ShareNotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center gap-6 px-4 py-10">
      <div className="flex flex-col gap-3 rounded-xl border border-line bg-paper p-6 shadow-sm">
        <h1 className="text-2xl font-bold">This listing isn&apos;t available</h1>
        <p className="text-ink-2">It may have been taken down, or the link may be incomplete. Everything currently posted is on the site.</p>
        <Link href="/browse" className="btn-primary self-start">
          Browse sublets
        </Link>
      </div>
      <p className="text-center text-xs leading-5 text-ink-3">
        <Link href="/" className="font-bold text-lake">
          {SITE.name}
        </Link>
        <br />
        {SITE.disclaimer}
      </p>
    </main>
  );
}
