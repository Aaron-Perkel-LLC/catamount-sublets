import { RequestsTab } from "@/components/admin/RequestsTab";
import { getDb } from "@/db";
import { requireAdminPage } from "@/server/auth";
import { approvedEmails, listPendingAccessRequests } from "@/server/data/access-requests";
import { adminMessagesForRequests, type AdminMessageRow } from "@/server/data/admin-messages";

/** Requests to add a school or to be let in, with replies, approvals and the approved addresses. */
export default async function AdminRequests() {
  await requireAdminPage("/admin/requests");
  const db = await getDb();
  const [pending, approved] = await Promise.all([listPendingAccessRequests(db), approvedEmails(db)]);
  const replies = await adminMessagesForRequests(db, pending.map((r) => r.id));
  const messageDto = (m: AdminMessageRow) => ({ ...m, createdAt: m.createdAt.toISOString() });
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink-3">
        {pending.length === 0 ? "Nothing" : pending.length} waiting · {approved.length} approved address{approved.length === 1 ? "" : "es"}
      </p>
      <RequestsTab requests={{ pending: pending.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), messages: (replies.get(r.id) ?? []).map(messageDto) })), approved }} />
    </div>
  );
}
