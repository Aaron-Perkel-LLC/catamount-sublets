/**
 * The files the stale-listing cleanup reads and writes, all in the private
 * working folder outside the repo (~/sublet-migration by default).
 * Logs are TSV: `time, address, user id, Resend id`.
 */
import { access, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export const DIR = process.env.SUBLET_MIGRATION_DIR ?? path.join(homedir(), "sublet-migration");
export const NOTICE_LOG = process.env.STALE_NOTICE_LOG ?? path.join(DIR, "stale-notice.log");
export const REMINDER_LOG = process.env.STALE_REMINDER_LOG ?? path.join(DIR, "stale-notice-reminder.log");
export const DELETIONS_LOG = process.env.DELETIONS_LOG ?? path.join(DIR, "deletions.log");
export const SUPPRESSED = path.join(DIR, "suppressed.txt");
export const SKIP = path.join(DIR, "skip.txt");

/** One column of a TSV/plain list, lower-cased, comments and blanks dropped; empty when the file is missing. */
export async function columnIn(file: string, column = 0): Promise<Set<string>> {
  try {
    const text = await readFile(file, "utf8");
    return new Set(
      text
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#"))
        .map((l) => l.split("\t")[column]?.trim().toLowerCase())
        .filter((s): s is string => Boolean(s)),
    );
  } catch {
    return new Set();
  }
}

export async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

/** The value after a flag, or null when the flag is absent. */
export function argAfter(args: string[], flag: string): string | null {
  const i = args.indexOf(flag);
  if (i < 0) return null;
  const v = args[i + 1]?.trim();
  if (!v || v.startsWith("--")) throw new Error(`${flag} needs a value`);
  return v;
}
