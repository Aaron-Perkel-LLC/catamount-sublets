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

/** The weekly digest's master switch. Off by default: the cron does nothing until the admin turns it on (src/server/services/digest.ts). */
export interface DigestSwitch {
  enabled: boolean;
}

/** Each cron's last run (src/server/data/cron-runs.ts): when, whether it finished, and its counts. Vercel's own logs keep an hour. */
export interface CronRun {
  at: string;
  ok: boolean;
  /** Counts and short state words only (never an address or an id). */
  summary: Record<string, number | boolean | string>;
}
export type CronRuns = Record<string, CronRun>;

interface Settings {
  cron_runs: CronRuns;
  announcement: Announcement;
  read_only: ReadOnly;
  approved_emails: ApprovedEmails;
  digest: DigestSwitch;
}

const DEFAULTS: Settings = {
  cron_runs: {},
  announcement: { active: false, message: "", style: "info" },
  read_only: { active: false, message: "" },
  approved_emails: { emails: [] },
  digest: { enabled: false },
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
