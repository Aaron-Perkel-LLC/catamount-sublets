import { SIGNED_OUT_SEE } from "@/lib/visibility";

/**
 * My post, under the status: who can find the listing. Every listing is
 * public unless the admin has kept it to signed-in students; there is no
 * switch for the poster.
 */
export function VisibilityNotice({ signedInOnly }: { signedInOnly: boolean }) {
  return (
    <div className="rounded-lg border border-line bg-paper px-3 py-2 text-sm">
      <p className="text-ink-2">
        {signedInOnly ? "Only signed-in students see this." : `Anyone can find this without signing in. They see the ${SIGNED_OUT_SEE}.`}
      </p>
    </div>
  );
}
