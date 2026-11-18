"use server";

import { z } from "zod";
import { getDb } from "@/db";
import { contactDetails, type ContactDetails } from "@/server/data/listings";
import { getViewer, refOf } from "@/server/viewer";

const idSchema = z.number().int().positive();

/**
 * The poster's contact details, for the Email / Call panel. Fetched when the
 * panel opens rather than shipped with every card, and only for a student or
 * the admin on a listing they may see: a community account or a signed-out
 * caller gets null (contactDetails() decides, from the viewer level).
 */
export async function fetchContactDetails(listingId: number): Promise<ContactDetails | null> {
  const id = idSchema.parse(listingId);
  return contactDetails(await getDb(), id, refOf(await getViewer()));
}
