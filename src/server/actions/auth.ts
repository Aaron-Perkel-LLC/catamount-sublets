"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/server/auth";

/** Signs the current session out and lands on the front page. */
export async function signOutAction(): Promise<void> {
  const auth = await getAuth();
  await auth.api.signOut({ headers: await headers() });
  redirect("/");
}
