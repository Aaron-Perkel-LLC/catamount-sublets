"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { getAuth, requireUserOrThrow } from "@/server/auth";
import { assertWritable } from "@/server/data/settings";
import { deletePerson } from "@/server/services/admin";
import { getNames, setNames } from "@/server/data/names";
import { checkName } from "@/lib/person-name";
import { safeNext } from "@/lib/safe-next";

export type NameState = { ok: boolean; error?: string; fieldErrors?: { first?: string; last?: string } };

/** Save first and last name, then continue to `next`. The welcome gate in the app layout sends people here. */
export async function saveNameAction(_prev: NameState, formData: FormData): Promise<NameState> {
  const user = await requireUserOrThrow();
  const first = checkName(formData.get("first"), "first name");
  const last = checkName(formData.get("last"), "last name");
  if (!first.ok || !last.ok) {
    return { ok: false, error: "Check the fields marked below.", fieldErrors: { first: first.ok ? undefined : first.error, last: last.ok ? undefined : last.error } };
  }
  const db = await getDb();
  await setNames(db, user.id, first.value, last.value);
  const next = safeNext(String(formData.get("next") ?? ""), "/browse");
  redirect(next === "/welcome" ? "/browse" : next);
}

/** For the account page: the names on file. */
export async function myNames() {
  const user = await requireUserOrThrow();
  return getNames(await getDb(), user.id);
}

/** Delete my account, my listing and its photos. Ends the session first so nothing can be done in between. */
export async function deleteMyAccount(confirm: string): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUserOrThrow();
  if (confirm !== user.email) return { ok: false, error: "Type your email address to confirm." };
  const db = await getDb();
  try {
    await assertWritable(db);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const auth = await getAuth();
  await auth.api.signOut({ headers: await headers() });
  const r = await deletePerson(db, user.id, null);
  if (!r.ok) return { ok: false, error: r.error };
  redirect("/?deleted=1");
}
