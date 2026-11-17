import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { listings } from "@/db/schema";

/**
 * The 21 Nov switch (`npm run go-public`, src/lib/visibility-rollout.ts):
 * every listing that is signed-in only and whose poster never chose
 * (visibility_chosen_at null) becomes public. Nothing else is touched: not
 * a listing whose poster chose either way, not one already public, not
 * visibility_chosen_at (going public was not the poster's call). Running it
 * again finds nothing, so it is safe to repeat.
 */

export interface GoPublicReport {
  /** The listings it makes (or would make) public, by id. */
  ids: number[];
  /** Of those, the ones with no approximate area yet: off the signed-out board until the daily sweep fills it. */
  withoutArea: number[];
  applied: boolean;
}

const selection = and(eq(listings.signedInOnly, true), isNull(listings.visibilityChosenAt));

export async function goPublic(db: DbOrTx, opts: { apply: boolean }): Promise<GoPublicReport> {
  const run = async (tx: DbOrTx): Promise<GoPublicReport> => {
    const query = tx.select({ id: listings.id, areaLat: listings.areaLat }).from(listings).where(selection).orderBy(asc(listings.id));
    // Locked only when applying; the dry run reads and nothing more.
    const rows = opts.apply ? await query.for("update") : await query;
    const ids = rows.map((r) => r.id);
    const withoutArea = rows.filter((r) => r.areaLat === null).map((r) => r.id);
    if (!opts.apply || ids.length === 0) return { ids, withoutArea, applied: false };
    // The selection again in the UPDATE, so a poster who chose a moment ago is left alone.
    const done = await tx
      .update(listings)
      .set({ signedInOnly: false })
      .where(and(inArray(listings.id, ids), selection))
      .returning({ id: listings.id });
    const changed = new Set(done.map((r) => r.id));
    return { ids: ids.filter((id) => changed.has(id)), withoutArea: withoutArea.filter((id) => changed.has(id)), applied: true };
  };
  return opts.apply ? db.transaction((tx) => run(tx)) : run(db);
}
