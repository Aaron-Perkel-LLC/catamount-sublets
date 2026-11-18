import { and, eq, inArray, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { session, user } from "@/db/schema";
import { tierForEmail } from "@/lib/auth-allow";
import { approvedEmails } from "./access-requests";

/**
 * After phase 31's deploy: migration 0013 reaches the production database
 * before the code that sets a tier does, so an account the old code creates
 * in between gets the column default, community, whatever its address. This
 * finds every community account that should be a student (a school address
 * by the shared rule, the admin's own, or an approved address) and, with
 * `apply`, makes it one and ends its sessions (so the five-minute session
 * cache can't keep the old tier). Running it again finds nothing.
 *
 * Accounts the admin moved to community by hand on purpose would be caught
 * too if their address is a school's; there are none before this phase, and
 * the report lists ids so the admin can check.
 */
export interface TierBackfillReport {
  /** Community accounts with a school, admin or approved address: what --apply changes. */
  wrong: { id: string; why: "school" | "approved" }[];
  /** Accounts by tier, before any change. */
  totals: { student: number; community: number };
  applied: number;
}

export async function tierBackfill(db: DbOrTx, opts: { apply: boolean }): Promise<TierBackfillReport> {
  const [community, approved, totals] = await Promise.all([
    db.select({ id: user.id, email: user.email }).from(user).where(eq(user.tier, "community")),
    approvedEmails(db),
    db.select({ tier: user.tier, n: sql<number>`count(*)::int` }).from(user).groupBy(user.tier),
  ]);
  const approvedSet = new Set(approved);
  const wrong = community.flatMap((u): TierBackfillReport["wrong"] =>
    tierForEmail(u.email) === "student" ? [{ id: u.id, why: "school" }] : approvedSet.has(u.email) ? [{ id: u.id, why: "approved" }] : [],
  );
  const report: TierBackfillReport = {
    wrong,
    totals: { student: totals.find((t) => t.tier === "student")?.n ?? 0, community: totals.find((t) => t.tier === "community")?.n ?? 0 },
    applied: 0,
  };
  if (!opts.apply || wrong.length === 0) return report;
  const ids = wrong.map((w) => w.id);
  const updated = await db.update(user).set({ tier: "student" }).where(and(inArray(user.id, ids), eq(user.tier, "community"))).returning({ id: user.id });
  await db.delete(session).where(inArray(session.userId, updated.map((u) => u.id)));
  return { ...report, applied: updated.length };
}
