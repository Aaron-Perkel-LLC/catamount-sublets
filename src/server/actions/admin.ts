"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import type { ListingStatus } from "@/lib/options";
import { requireAdmin } from "@/server/auth";
import { approveAccessRequest, dismissAccessRequest, revokeApprovedEmail } from "@/server/data/access-requests";
import { listingForViewer, type ListingDto } from "@/server/data/listings";
import { setSetting, type Announcement } from "@/server/data/settings";
import * as admin from "@/server/services/admin";
import { photoOpFor, type PhotoOp, type PhotosResult } from "@/server/services/listing";

const revalidate = () => {
  for (const p of ["/admin", "/browse", "/map", "/post", "/"]) revalidatePath(p);
};

export async function adminAddSemester(input: { code: string; name: string }): Promise<admin.Result> {
  await requireAdmin();
  const r = await admin.addSemester(await getDb(), input);
  if (r.ok) revalidate();
  return r;
}

export async function adminToggleSemester(code: string): Promise<admin.Result<{ active: boolean }>> {
  await requireAdmin();
  const r = await admin.toggleSemester(await getDb(), z.string().max(40).parse(code));
  if (r.ok) revalidate();
  return r;
}

export async function adminDeleteSemester(code: string): Promise<admin.Result> {
  await requireAdmin();
  const r = await admin.deleteSemester(await getDb(), z.string().max(40).parse(code));
  if (r.ok) revalidate();
  return r;
}

export async function adminArchivePreview(code: string): Promise<admin.ArchivePlan> {
  await requireAdmin();
  return admin.archivePlan(await getDb(), z.string().max(40).parse(code));
}

export async function adminArchiveCommit(code: string, confirm: string): Promise<admin.Result<{ listings: number; filesDeleted: number }>> {
  await requireAdmin();
  const r = await admin.archiveCommit(await getDb(), z.string().max(40).parse(code), z.string().max(40).parse(confirm));
  if (r.ok) revalidate();
  return r;
}

const announcementInput = z.object({ active: z.boolean(), message: z.string().trim().max(2000), style: z.enum(["info", "warning", "success"]) });

export async function adminSetAnnouncement(input: Announcement): Promise<admin.Result> {
  const user = await requireAdmin();
  const parsed = announcementInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the announcement." };
  if (parsed.data.active && !parsed.data.message) return { ok: false, error: "Write the message first." };
  await setSetting(await getDb(), "announcement", parsed.data, user.id);
  revalidate();
  return { ok: true, data: undefined };
}

export async function adminSetReadOnly(active: boolean, message: string): Promise<admin.Result> {
  const user = await requireAdmin();
  await setSetting(await getDb(), "read_only", { active: Boolean(active), message: z.string().trim().max(300).parse(message) }, user.id);
  revalidate();
  return { ok: true, data: undefined };
}

export async function adminSetListingStatus(listingId: number, status: ListingStatus): Promise<admin.Result> {
  await requireAdmin();
  const r = await admin.adminSetStatus(await getDb(), z.number().int().positive().parse(listingId), status);
  if (r.ok) revalidate();
  return r;
}

/** Any listing, whatever its status or semesters, for the admin's listing view. */
export async function adminLoadListing(listingId: number): Promise<ListingDto | null> {
  const me = await requireAdmin();
  return listingForViewer(await getDb(), z.number().int().positive().parse(listingId), me.id, { anyVisibility: true });
}

export async function adminDeleteListing(listingId: number): Promise<admin.Result> {
  await requireAdmin();
  const r = await admin.adminDeleteListing(await getDb(), z.number().int().positive().parse(listingId));
  if (r.ok) revalidate();
  return r;
}

export async function adminSetBanned(userId: string, banned: boolean, reason: string | null): Promise<admin.Result> {
  const me = await requireAdmin();
  const r = await admin.setBanned(await getDb(), z.string().uuid().parse(userId), banned, reason, me.id);
  if (r.ok) revalidate();
  return r;
}

export async function adminSetNoEmail(userId: string, noEmail: boolean): Promise<admin.Result> {
  await requireAdmin();
  const r = await admin.setNoEmail(await getDb(), z.string().uuid().parse(userId), z.boolean().parse(noEmail));
  if (r.ok) revalidate();
  return r;
}

export async function adminDeletePerson(userId: string, dryRun: boolean): Promise<admin.Result<admin.DeletionReport>> {
  const me = await requireAdmin();
  const r = await admin.deletePerson(await getDb(), z.string().uuid().parse(userId), me.id, dryRun);
  if (r.ok && !dryRun) revalidate();
  return r;
}

export async function adminLoadInventory(): Promise<admin.InventoryListing[]> {
  await requireAdmin();
  return admin.imageInventory(await getDb());
}

export async function adminPhotoOp(photoId: number, op: PhotoOp): Promise<PhotosResult> {
  const me = await requireAdmin();
  const r = await photoOpFor(await getDb(), me, z.number().int().positive().parse(photoId), op);
  if (r.ok) revalidate();
  return r;
}

export async function adminBulkDeletePhotos(photoIds: number[]): Promise<admin.Result<{ deleted: number; kept: number }>> {
  await requireAdmin();
  const r = await admin.bulkDeletePhotos(await getDb(), z.array(z.number().int().positive()).max(500).parse(photoIds));
  if (r.ok) revalidate();
  return r;
}

export async function adminLoadOrphans(): Promise<admin.OrphanReport> {
  await requireAdmin();
  return admin.orphanReport(await getDb(), true);
}

export async function adminDeleteOrphans(urls: string[], confirm: number): Promise<admin.Result<{ deleted: number }>> {
  await requireAdmin();
  return admin.deleteOrphans(await getDb(), z.array(z.string().max(500)).max(2000).parse(urls), z.number().int().nonnegative().parse(confirm));
}

export async function adminSendBroadcast(audience: admin.Audience, subject: string, body: string): Promise<admin.Result<{ sent: number; failed: number }>> {
  await requireAdmin();
  return admin.sendBroadcastTo(await getDb(), audience, { subject, body });
}

export async function adminBroadcastCount(audience: admin.Audience): Promise<number> {
  await requireAdmin();
  return (await admin.broadcastRecipients(await getDb(), audience)).length;
}

const requestId = z.number().int().positive();

/** Approve an access request: its address may sign in from now on. */
export async function adminApproveAccessRequest(id: number): Promise<admin.Result<{ email: string }>> {
  const me = await requireAdmin();
  const email = await approveAccessRequest(await getDb(), requestId.parse(id), me.id);
  if (!email) return { ok: false, error: "That request was already handled." };
  revalidatePath("/admin");
  return { ok: true, data: { email } };
}

/** Close an access request without approving it. */
export async function adminDismissAccessRequest(id: number): Promise<admin.Result> {
  await requireAdmin();
  if (!(await dismissAccessRequest(await getDb(), requestId.parse(id)))) return { ok: false, error: "That request was already handled." };
  revalidatePath("/admin");
  return { ok: true, data: undefined };
}

/** Stop new sign-ins for an approved address. */
export async function adminRevokeApprovedEmail(email: string): Promise<admin.Result> {
  const me = await requireAdmin();
  if (!(await revokeApprovedEmail(await getDb(), z.string().email().max(254).parse(email), me.id))) return { ok: false, error: "That address wasn't on the list." };
  revalidatePath("/admin");
  return { ok: true, data: undefined };
}
