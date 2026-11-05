"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import type { ListingStatus } from "@/lib/options";
import { requireUserOrThrow } from "@/server/auth";
import {
  attachPhotoFor,
  deleteListingFor,
  photoOpFor,
  saveListingFor,
  setStatusFor,
  type AttachResult,
  type PhotosResult,
  type SaveState,
} from "@/server/services/listing";

export type { AttachResult, PhotosResult, SaveState };

const revalidate = () => {
  for (const p of ["/browse", "/map", "/post", "/"]) revalidatePath(p);
};

/** Create or update the signed-in person's one listing. */
export async function saveListing(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const user = await requireUserOrThrow();
  const result = await saveListingFor(await getDb(), user, formData);
  if (result.ok) revalidate();
  return result;
}

export async function setMyListingStatus(status: ListingStatus): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUserOrThrow();
  const result = await setStatusFor(await getDb(), user, status);
  if (result.ok) revalidate();
  return result;
}

export async function deleteMyListing(): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUserOrThrow();
  const result = await deleteListingFor(await getDb(), user);
  if (!result.ok) return result;
  revalidate();
  redirect("/browse");
}

export async function attachPhoto(ref: string): Promise<AttachResult> {
  const user = await requireUserOrThrow();
  const result = await attachPhotoFor(await getDb(), user, ref);
  if (result.ok) revalidate();
  return result;
}

export async function movePhotoAction(photoId: number, dir: -1 | 1): Promise<PhotosResult> {
  const user = await requireUserOrThrow();
  const result = await photoOpFor(await getDb(), user, photoId, { kind: "move", dir: dir === -1 ? -1 : 1 });
  if (result.ok) revalidate();
  return result;
}

export async function setCoverAction(photoId: number): Promise<PhotosResult> {
  const user = await requireUserOrThrow();
  const result = await photoOpFor(await getDb(), user, photoId, { kind: "cover" });
  if (result.ok) revalidate();
  return result;
}

export async function deletePhotoAction(photoId: number): Promise<PhotosResult> {
  const user = await requireUserOrThrow();
  const result = await photoOpFor(await getDb(), user, photoId, { kind: "delete" });
  if (result.ok) revalidate();
  return result;
}
