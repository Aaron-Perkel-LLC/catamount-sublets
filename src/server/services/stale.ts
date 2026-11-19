import type { Db } from "@/db";
import { type StaleRow, staleAudience, stillNeverSignedIn } from "@/server/data/stale";
import { deletePerson } from "./admin";

/**
 * After the stale-notice deadline: remove each migrated poster who was sent
 * the notice and has still never signed in, account and listing together,
 * through deletePerson (the delete-user path: photos from storage, sessions,
 * admin emails; the listing's events stay). Nothing is written to listing_outcomes: nobody
 * answered, and a removal is not an outcome.
 *
 * Who goes: the audience recomputed now (so anyone who signed in after the
 * notice has dropped out), limited to the user ids in the notice log. With
 * `includeSuppressed`, also audience members whose address is on Resend's
 * suppression list (they could never get the notice, nor sign in).
 * Always kept: Stop-email accounts, addresses on skip.txt, and anyone not
 * mailed for any other reason (a failed send). Each person is checked again
 * just before their removal.
 */

export interface RemoveStaleInput {
  /** User ids from the notice log (column 3). */
  mailedIds: ReadonlySet<string>;
  /** Lower-case addresses on skip.txt: never removed. */
  skip: ReadonlySet<string>;
  /** Lower-case addresses on suppressed.txt, removed only with includeSuppressed. */
  suppressed: ReadonlySet<string>;
  includeSuppressed: boolean;
  apply: boolean;
}

export interface RemoveStaleReport {
  audience: number;
  targets: number;
  keptNoEmail: number;
  keptSkip: number;
  keptUnmailed: number;
  /** Signed in (or otherwise changed) between the plan and their turn. */
  droppedAtRecheck: number;
  removed: number;
  photos: number;
  events: number;
  failed: number;
}

export function planRemoval(audience: { mail: StaleRow[]; noEmail: StaleRow[] }, input: Omit<RemoveStaleInput, "apply">): { targets: StaleRow[]; keptSkip: number; keptUnmailed: number } {
  const targets: StaleRow[] = [];
  let keptSkip = 0;
  let keptUnmailed = 0;
  for (const r of audience.mail) {
    if (input.skip.has(r.email)) keptSkip++;
    else if (input.mailedIds.has(r.id)) targets.push(r);
    else if (input.includeSuppressed && input.suppressed.has(r.email)) targets.push(r);
    else keptUnmailed++;
  }
  return { targets, keptSkip, keptUnmailed };
}

export async function removeStale(db: Db, input: RemoveStaleInput, onRemoved?: (r: { userId: string; listingId: number | null; photos: number; events: number }) => Promise<void>): Promise<RemoveStaleReport> {
  const audience = await staleAudience(db);
  const { targets, keptSkip, keptUnmailed } = planRemoval(audience, input);
  const report: RemoveStaleReport = { audience: audience.mail.length + audience.noEmail.length, targets: targets.length, keptNoEmail: audience.noEmail.length, keptSkip, keptUnmailed, droppedAtRecheck: 0, removed: 0, photos: 0, events: 0, failed: 0 };
  for (const t of targets) {
    if (!(await stillNeverSignedIn(db, t.id))) {
      report.droppedAtRecheck++;
      continue;
    }
    const r = await deletePerson(db, t.id, null, !input.apply);
    if (!r.ok) {
      report.failed++;
      continue;
    }
    report.removed++;
    report.photos += r.data.photos;
    report.events += r.data.events;
    if (input.apply) {
      await onRemoved?.({ userId: t.id, listingId: r.data.listingId, photos: r.data.photos, events: r.data.events });
    }
  }
  return report;
}
