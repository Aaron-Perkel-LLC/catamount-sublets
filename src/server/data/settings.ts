import { eq } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { siteSettings } from "@/db/schema";

export interface Announcement {
  active: boolean;
  message: string;
  style: "info" | "warning" | "success";
}
export interface ReadOnly {
  active: boolean;
  message: string;
}

/** Addresses outside the allowed domains that the admin approved from an access request. */
export interface ApprovedEmails {
  emails: string[];
}

interface Settings {
  announcement: Announcement;
  read_only: ReadOnly;
  approved_emails: ApprovedEmails;
}

const DEFAULTS: Settings = {
  announcement: { active: false, message: "", style: "info" },
  read_only: { active: false, message: "" },
  approved_emails: { emails: [] },
};

export async function getSetting<K extends keyof Settings>(db: DbOrTx, key: K): Promise<Settings[K]> {
  const [row] = await db.select({ value: siteSettings.value }).from(siteSettings).where(eq(siteSettings.key, key)).limit(1);
  return { ...DEFAULTS[key], ...((row?.value as Partial<Settings[K]>) ?? {}) };
}

export async function setSetting<K extends keyof Settings>(db: DbOrTx, key: K, value: Settings[K], userId: string | null): Promise<void> {
  const json = value as unknown as Record<string, unknown>;
  await db
    .insert(siteSettings)
    .values({ key, value: json, updatedByUserId: userId })
    .onConflictDoUpdate({ target: siteSettings.key, set: { value: json, updatedByUserId: userId, updatedAt: new Date() } });
}

export class ReadOnlyError extends Error {
  constructor(message: string) {
    super(message || "The site is read-only for a moment. Try again shortly.");
    this.name = "ReadOnlyError";
  }
}

/** Every write action calls this first: the read-only switch (soft open, maintenance). */
export async function assertWritable(db: DbOrTx): Promise<void> {
  const ro = await getSetting(db, "read_only");
  if (ro.active) throw new ReadOnlyError(ro.message);
}
