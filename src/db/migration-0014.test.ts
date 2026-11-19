import { type SQL, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "./index";
import { createTestDb } from "./test-db";

/**
 * 0014: emails and email_deliveries replace admin_messages. Every one-off
 * email is carried over as an email with one recipient row under the same
 * id (a row still pending as a failure), Stop email set before now is
 * marked as the admin's doing, and the old table goes. Rows are written with
 * raw SQL against the 0013 schema.
 */
let db: Db;
let close: () => Promise<void>;
let migrateRest: () => Promise<void>;
const rows = async (q: SQL) => ((await db.execute(q)) as unknown as { rows: Record<string, unknown>[] }).rows;
const ADMIN = "00000000-0000-4000-8000-000000000001";
const SAM = "00000000-0000-4000-8000-000000000002";

beforeAll(async () => {
  ({ db, close, migrateRest } = await createTestDb({ upTo: "0013_daffy_xorn" }));
  await db.execute(sql`insert into "user" (id, email, name, role, no_email) values (${ADMIN}, 'admin@uvm.edu', 'admin', 'admin', false), (${SAM}, 'sam@uvm.edu', 'sam', null, true)`);
  await db.execute(sql`insert into access_requests (id, kind, name, email, message) values (7, 'access', 'Dana', 'dana@example.org', 'Please')`);
  await db.execute(sql`insert into admin_messages (id, sender_id, recipient, subject, body, status, resend_id, error, idempotency_key, access_request_id, created_at, attempted_at) values
    (3, ${ADMIN}, 'sam@uvm.edu', 'About your listing', 'Hello', 'sent', 're_1', null, 'k3', null, '2026-11-06T15:00:00Z', '2026-11-06T15:00:02Z'),
    (5, ${ADMIN}, 'dana@example.org', 'Your access request', 'Approved', 'failed', null, 'Mailbox does not exist', 'k5', 7, '2026-11-12T15:00:00Z', '2026-11-12T15:00:01Z'),
    (9, ${ADMIN}, 'late@example.org', 'Stuck', 'Body', 'pending', null, null, 'k9', null, '2026-11-18T15:00:00Z', '2026-11-18T15:00:00Z')`);
  await migrateRest();
});
afterAll(() => close());

describe("migration 0014", () => {
  it("carries each one-off email over as an email with one recipient row, under the same id", async () => {
    const e = await rows(sql`select id, status, subject, audience, to_label, access_request_id, sender, created_by, sent_at from emails order by id`);
    expect(e.map((r) => [r.id, r.status, r.subject, r.audience, r.to_label, r.access_request_id, r.sender, r.created_by])).toEqual([
      [3, "sent", "About your listing", { kind: "address", email: "sam@uvm.edu" }, "sam@uvm.edu", null, "personal", ADMIN],
      [5, "sent", "Your access request", { kind: "address", email: "dana@example.org" }, "dana@example.org", 7, "personal", ADMIN],
      [9, "sent", "Stuck", { kind: "address", email: "late@example.org" }, "late@example.org", null, "personal", ADMIN],
    ]);
    expect(new Date(e[0].sent_at as string).toISOString()).toBe("2026-11-06T15:00:00.000Z");
    const d = await rows(sql`select email_id, user_id, address, status, reason, provider_id, test, sent_at from email_deliveries order by email_id`);
    expect(d.map((r) => [r.email_id, r.user_id, r.address, r.status, r.reason, r.provider_id, r.test])).toEqual([
      [3, SAM, "sam@uvm.edu", "sent", null, "re_1", false],
      [5, null, "dana@example.org", "failed", "Mailbox does not exist", null, false],
      [9, null, "late@example.org", "failed", "Interrupted before it was known to have gone.", null, false],
    ]);
    expect(d[0].sent_at).not.toBeNull();
    expect(d[1].sent_at).toBeNull();
  });

  it("starts new emails after the carried-over ids, marks old Stop email as the admin's, and drops the old table", async () => {
    const [next] = await rows(sql`insert into emails (audience) values ('{"kind":"board"}') returning id`);
    expect(next.id).toBe(10);
    expect(await rows(sql`select email, no_email_source, no_email_at from "user" order by email`)).toEqual([
      { email: "admin@uvm.edu", no_email_source: null, no_email_at: null },
      { email: "sam@uvm.edu", no_email_source: "admin", no_email_at: null },
    ]);
    expect((await rows(sql`select to_regclass('admin_messages') as t`))[0].t).toBeNull();
  });
});
