import Link from "next/link";
import { NameForm } from "@/components/account/NameForm";
import { getDb } from "@/db";
import { requireUser } from "@/server/auth";
import { getNames } from "@/server/data/names";
import { DeleteAccount } from "./delete-account";

/** The account: what we hold, and the way out. */
export default async function AccountPage() {
  const user = await requireUser("/account");
  const names = await getNames(await getDb(), user.id);
  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Account</h1>
        <p className="text-sm text-ink-2">
          Signed in as <strong className="text-ink">{user.email}</strong>
          {user.role === "admin" && <span className="ml-2 rounded-full bg-notice-tint px-2 py-0.5 text-xs font-bold text-notice-ink">Admin</span>}
        </p>
      </div>
      <section aria-labelledby="name-heading" className="flex flex-col gap-3">
        <div>
          <h2 id="name-heading" className="text-lg font-bold">
            Your name
          </h2>
          <p className="text-sm text-ink-2">Shown on your listing. Your contact details are on My post.</p>
        </div>
        <NameForm initial={names.prefill} next="/account" submitLabel="Save name" />
      </section>
      <section aria-labelledby="data-heading" className="flex flex-col gap-1 text-sm text-ink-2">
        <h2 id="data-heading" className="text-lg font-bold text-ink">
          Your data
        </h2>
        <p>
          We keep your email, your listing and totals of views and contacts on it, never who.{" "}
          <Link href="/privacy" className="link">
            Privacy
          </Link>{" "}
          has the rest.
        </p>
      </section>
      <DeleteAccount email={user.email} />
    </section>
  );
}
