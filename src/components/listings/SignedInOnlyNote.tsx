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
