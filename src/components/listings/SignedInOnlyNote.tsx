import Link from "next/link";
import { ACCESS } from "@/config/site";

/**
 * The public board (signed-out visitors and community accounts): how many
 * more listings their posters keep to students. A count, nothing about them.
 * Signed out, it offers sign-in; a community account would see nothing more
 * by signing in, so it only says who they are for.
 */
export function SignedInOnlyNote({ count, next, community = false }: { count: number; next: string; community?: boolean }) {
  if (count <= 0) return null;
  const lead = `${count} more listing${count === 1 ? " is" : "s are"} visible to ${ACCESS.audience} only.`;
  return (
    <p className="rounded-lg border border-notice-line bg-notice-tint px-3 py-2 text-sm text-ink">
      {lead}
      {!community && (
        <>
          {" "}
          <Link href={`/sign-in?next=${encodeURIComponent(next)}`} className="link font-bold">
            {ACCESS.schools} students: sign in to see {count === 1 ? "it" : "them"}.
          </Link>
        </>
      )}
    </p>
  );
}

/**
 * The public board when nothing at all is public but some listings are kept
 * to students: one message in place of the note and the empty board, which
 * would otherwise say "N more…" next to "No listings up right now".
 */
export function AllSignedInOnly({ count, next, community = false }: { count: number; next: string; community?: boolean }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-paper px-6 py-12 text-center">
      <p className="text-lg font-bold">
        {count === 1 ? "The 1 listing up is" : `All ${count} listings are`} visible to {ACCESS.audience} only right now.
      </p>
      {!community && (
        <p className="mt-1 text-ink-2">
          <Link href={`/sign-in?next=${encodeURIComponent(next)}`} className="link font-bold">
            {ACCESS.schools} students: sign in to see {count === 1 ? "it" : "them"}.
          </Link>
        </p>
      )}
    </div>
  );
}
