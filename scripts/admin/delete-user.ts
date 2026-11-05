/**
 * Remove one person entirely: account, listing, photos (from storage),
 * activity events and sessions. Dry run by default; --apply deletes and
 * appends one line to the deletions log (timestamp, identifier, counts).
 *
 *   npm run delete-user -- jsmith@uvm.edu
 *   npm run delete-user -- jsmith --apply
 *
 * Against production this is a production write and a deletion: run it only
 * on an explicit go-ahead, one person at a time. The log path is
 * DELETIONS_LOG (default ~/sublet-migration/deletions.log).
 */
import { appendFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { eq, or } from "drizzle-orm";
import { getDb } from "../../src/db";
import { user } from "../../src/db/schema";
import { deletePerson } from "../../src/server/services/admin";

async function main() {
  const identifier = process.argv.slice(2).find((a) => !a.startsWith("--"))?.trim().toLowerCase();
  const apply = process.argv.includes("--apply");
  if (!identifier) throw new Error("usage: delete-user <email-or-netid> [--apply]");
  const db = await getDb();
  const [found] = await db.select({ id: user.id, email: user.email, role: user.role }).from(user).where(or(eq(user.email, identifier), eq(user.legacyNetid, identifier)));
  if (!found) {
    console.log(`no account for ${identifier}`);
    process.exit(2);
  }
  if (found.role === "admin") throw new Error("refusing to delete an admin account from the command line");

  const preview = await deletePerson(db, found.id, null, true);
  if (!preview.ok) throw new Error(preview.error);
  const d = preview.data;
  console.log(`${d.email}: ${d.listingId ? `listing #${d.listingId}, ${d.photos} photo(s) (${d.files} files), ${d.events} event(s)` : "no listing"}, ${d.sessions} session(s)`);
  if (!apply) {
    console.log("dry run; add --apply to delete.");
    return;
  }
  const r = await deletePerson(db, found.id, null, false);
  if (!r.ok) throw new Error(r.error);
  const logPath = process.env.DELETIONS_LOG ?? path.join(homedir(), "sublet-migration", "deletions.log");
  await mkdir(path.dirname(logPath), { recursive: true });
  await appendFile(logPath, `${new Date().toISOString()} deleted ${identifier} listing=${d.listingId ?? "-"} photos=${d.photos} events=${d.events} sessions=${d.sessions}\n`);
  console.log(`deleted. logged to ${logPath}`);
}

main().then(
  () => process.exit(process.exitCode ?? 0),
  (e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
