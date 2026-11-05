/**
 * The welcome recipients as CSV files of 15 addresses each, for sending by
 * hand (BCC from aaron@catamountsublets.com) if Resend cannot be used:
 *   npm run welcome-batches            → ~/sublet-migration/welcome-batches/batch-01.csv …
 * Same audience as send-welcome: migrated accounts, admins left out, addresses
 * already in the welcome log left out. The files hold real addresses: they
 * live outside every checkout and are deleted after the send.
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { eq, isNotNull, sql } from "drizzle-orm";
import { getDb } from "../../src/db";
import { listings, user } from "../../src/db/schema";
import { isTestAddress } from "../../src/server/email/send";

const BATCH = 15;
const DIR = process.env.WELCOME_BATCH_DIR ?? path.join(homedir(), "sublet-migration", "welcome-batches");
const LOG = process.env.WELCOME_LOG ?? path.join(homedir(), "sublet-migration", "welcome.log");

async function main() {
  const db = await getDb();
  const rows = await db
    .select({ email: user.email, role: user.role, firstName: user.firstName, listingId: listings.id })
    .from(user)
    .leftJoin(listings, eq(listings.userId, user.id))
    .where(isNotNull(user.legacyNetid))
    .orderBy(sql`greatest(${listings.postedAt}, coalesce(${listings.statusChangedAt}, ${listings.postedAt})) desc nulls last`, user.email); // most recently active first, as send-welcome
  const column = async (file: string, col: number) =>
    new Set(
      (await readFile(file, "utf8").catch(() => ""))
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#"))
        .map((l) => l.split("\t")[col]?.trim().toLowerCase())
        .filter((s): s is string => Boolean(s)),
    );
  const done = await column(LOG, 1);
  const suppressed = await column(path.join(homedir(), "sublet-migration", "suppressed.txt"), 0);
  const skip = await column(path.join(homedir(), "sublet-migration", "skip.txt"), 0);
  const todo = rows.filter((r) => r.role !== "admin" && !done.has(r.email) && !suppressed.has(r.email) && !skip.has(r.email) && !isTestAddress(r.email));
  await rm(DIR, { recursive: true, force: true });
  await mkdir(DIR, { recursive: true, mode: 0o700 });
  let n = 0;
  for (let i = 0; i < todo.length; i += BATCH) {
    n++;
    const file = path.join(DIR, `batch-${String(n).padStart(2, "0")}.csv`);
    const body = ["email,first_name,listing_id", ...todo.slice(i, i + BATCH).map((r) => `${r.email},${r.firstName ?? ""},${r.listingId ?? ""}`)].join("\n") + "\n";
    await writeFile(file, body, { mode: 0o600 });
  }
  console.log(`${todo.length} recipient(s) in ${n} file(s) of up to ${BATCH}, under ${DIR} (${done.size} already welcomed, admins left out)`);
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
