/**
 * Clears the rate-limit state so a tester can ask for codes again:
 *   npm run clear-rate-limits                     every window and counter
 *   npm run clear-rate-limits -- jsmith@uvm.edu   plus that address's code rows and in-flight codes
 * Point DATABASE_URL at the branch you mean (never production without a reason).
 */
import { eq, like } from "drizzle-orm";
import { getDb } from "../../src/db";
import { otpSends, rateLimit, rateLimitBuckets, verification } from "../../src/db/schema";

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  const db = await getDb();
  const buckets = await db.delete(rateLimitBuckets).returning({ k: rateLimitBuckets.key });
  const limits = await db.delete(rateLimit).returning({ k: rateLimit.key });
  let sends = 0;
  let codes = 0;
  if (email) {
    sends = (await db.delete(otpSends).where(eq(otpSends.email, email)).returning({ id: otpSends.id })).length;
    codes = (await db.delete(verification).where(like(verification.identifier, `%${email}`)).returning({ id: verification.id })).length;
  }
  console.log(`cleared: ${buckets.length} app windows, ${limits.length} better-auth counters${email ? `, ${sends} code-send rows and ${codes} pending codes for ${email}` : ""}`);
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
