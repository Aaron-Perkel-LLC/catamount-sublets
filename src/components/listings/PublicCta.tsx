import Link from "next/link";
import { ACCESS } from "@/config/site";

/** Where a signed-out visitor goes for the rest: sign in, and land on this listing's full view. */
export function signInForListing(id: number): string {
  return `/sign-in?next=${encodeURIComponent(`/browse?id=${id}`)}`;
}

/** The signed-out prompt: students see everything once signed in; anyone else can sign in to message the poster. */
export function PublicCta({ id }: { id: number }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-notice-line bg-notice-tint p-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-ink">
        {ACCESS.schools} students: sign in to see the exact address and contact the poster. Anyone else: sign in with any email to message the poster.
      </p>
      <Link href={signInForListing(id)} className="btn-primary shrink-0 px-3 py-2 text-sm">
        Sign in
      </Link>
    </div>
  );
}
