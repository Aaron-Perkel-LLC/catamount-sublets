"use server";

import { z } from "zod";
import { getDb } from "@/db";
import { contactDetails, type ContactDetails } from "@/server/data/listings";
import { requireUserOrThrow } from "@/server/auth";

const idSchema = z.number().int().positive();

/**
 * The poster's contact details, for the Email / Call panel. Fetched when the
 * panel opens rather than shipped with every card, and only for a listing the
 * viewer may see.
 */
export async function fetchContactDetails(listingId: number): Promise<ContactDetails | null> {
  const user = await requireUserOrThrow();
  const id = idSchema.parse(listingId);
  return contactDetails(await getDb(), id, user.id, user.role === "admin");
}
