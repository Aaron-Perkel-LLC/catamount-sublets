import { RequestsTab } from "@/components/admin/RequestsTab";
import { getDb } from "@/db";
import { requireAdminPage } from "@/server/auth";
import { approvedEmails, listPendingAccessRequests } from "@/server/data/access-requests";
import { repliesForRequests } from "@/server/data/emails";

/** Requests to add a school or to be let in, with the replies written to them, approvals and the approved addresses. */
export default async function AdminRequests() {
  await requireAdminPage("/admin/requests");
  const db = await getDb();
  const [pending, approved] = await Promise.all([listPendingAccessRequests(db), approvedEmails(db)]);
  const replies = await repliesForRequests(db, pending.map((r) => r.id));
  return (
    <RequestsTab
      requests={{
        pending: pending.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), replies: (replies.get(r.id) ?? []).map((m) => ({ id: m.id, subject: m.subject, status: m.status, reason: m.reason, at: m.at.toISOString() })) })),
        approved,
      }}
    />
  );
}
