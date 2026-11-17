import Link from "next/link";

/** Signed-out Browse and Map: how many more there are behind sign-in. A count, nothing about them. */
export function SignedInOnlyNote({ count, next }: { count: number; next: string }) {
  if (count <= 0) return null;
  return (
    <p className="rounded-lg border border-notice-line bg-notice-tint px-3 py-2 text-sm text-ink">
      {count} more listing{count === 1 ? " is" : "s are"} visible to signed-in students.{" "}
      <Link href={`/sign-in?next=${encodeURIComponent(next)}`} className="link font-bold">
        Sign in to see {count === 1 ? "it" : "them"}.
      </Link>
    </p>
  );
}

/**
 * Signed-out Browse and Map when nothing at all is public but some listings
 * are behind sign-in: one message in place of the note and the empty board,
 * which would otherwise say "N more…" next to "No listings up right now".
 */
export function AllSignedInOnly({ count, next }: { count: number; next: string }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-paper px-6 py-12 text-center">
      <p className="text-lg font-bold">
        {count === 1 ? "The 1 listing up is" : `All ${count} listings are`} visible to signed-in students only right now.
      </p>
      <p className="mt-1 text-ink-2">
        <Link href={`/sign-in?next=${encodeURIComponent(next)}`} className="link font-bold">
          Sign in to see {count === 1 ? "it" : "them"}.
        </Link>
      </p>
    </div>
  );
}
