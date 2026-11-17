"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { requireUserOrThrow } from "@/server/auth";
import * as digest from "@/server/services/digest";

/**
 * Saved searches and the weekly email, for the signed-in person only: every
 * call acts on the session's own rows (the data layer filters by its id).
 * Inputs are the zod schemas in src/lib/digest.ts, checked in the service.
 */

export async function saveSearchAction(input: unknown): Promise<digest.Result<{ id: number; digestOn: boolean }>> {
  const user = await requireUserOrThrow();
  const r = await digest.saveSearch(await getDb(), user.id, input);
  if (r.ok) revalidatePath("/account");
  return r;
}

export async function renameSearchAction(input: unknown): Promise<digest.Result> {
  const user = await requireUserOrThrow();
  const r = await digest.renameSearch(await getDb(), user.id, input);
  if (r.ok) revalidatePath("/account");
  return r;
}

export async function deleteSearchAction(input: unknown): Promise<digest.Result> {
  const user = await requireUserOrThrow();
  const r = await digest.deleteSearch(await getDb(), user.id, input);
  if (r.ok) revalidatePath("/account");
  return r;
}

export async function setDigestAction(input: unknown): Promise<digest.Result<{ enabled: boolean }>> {
  const user = await requireUserOrThrow();
  const r = await digest.setMyDigest(await getDb(), user.id, input);
  if (r.ok) revalidatePath("/account");
  return r;
}

/** The /unsubscribe page's confirm button. No session: the signed token is the authorisation. */
export async function unsubscribeAction(token: string): Promise<{ ok: boolean }> {
  return digest.unsubscribeWithToken(await getDb(), token, "page");
}
