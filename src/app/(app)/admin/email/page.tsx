import { EmailOutbox } from "@/components/admin/EmailOutbox";
import { StatList } from "@/components/admin/StatList";
import { CARD, num } from "@/components/admin/ui";
import { getDb } from "@/db";
import { semesters } from "@/db/schema";
import { type AdminSearchParams, param } from "@/lib/admin-page";
import { resolveRange } from "@/lib/admin-range";
import { audienceLabel, isGroup } from "@/lib/email";
import { requireAdminPage } from "@/server/auth";
import { emailNumbers } from "@/server/data/admin-metrics";
import { listEmails } from "@/server/data/emails";

/**
 * Email: everything the admin has written from here, one row per email, and
 * the way into writing one. Beside it, the range's numbers and who can be
 * emailed at all.
 */
export default async function AdminEmail({ searchParams }: { searchParams: AdminSearchParams }) {
  await requireAdminPage("/admin/email");
  const sp = await searchParams;
  const r = resolveRange({ range: param(sp, "range"), from: param(sp, "from"), to: param(sp, "to") });
  const db = await getDb();
  const [list, n, sems] = await Promise.all([listEmails(db), emailNumbers(db, r), db.select({ code: semesters.code, name: semesters.name }).from(semesters)]);
  const names = new Map(sems.map((s) => [s.code, s.name]));
  const stat = (label: string, value: number, tip?: string) => ({ label, value: num(value), zero: value === 0, tip });
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
      <EmailOutbox
        rows={list.map((e) => ({
          id: e.id,
          status: e.status,
          subject: e.subject,
          to: e.toLabel ?? audienceLabel(e.audience, names),
          group: isGroup(e.audience),
          at: (e.sentAt ?? e.updatedAt).toISOString(),
          sent: e.sent,
          failed: e.failed,
          leftOut: e.leftOut,
          waiting: e.waiting,
          note: e.accessRequestId ? `Reply to request #${e.accessRequestId}` : !isGroup(e.audience) ? e.firstReason : null,
        }))}
      />
      <section className={`${CARD} py-2`} aria-label="Email numbers">
        <StatList
          groups={[
            {
              title: r.label,
              stats: [
                stat("Emails", n.emails, "Sent in the range. One to a group counts once."),
                stat("People reached", n.reached),
                stat("Failed", n.failed),
                stat("Unsubscribed", n.unsubscribed, "Used the one-click link in a group email. They are marked Stop email."),
              ],
            },
            {
              title: "Who can be emailed",
              stats: [stat("Accounts", n.accounts), stat("Stop email", n.stopEmail, 'Left out of every group email. One written to them alone needs "Send anyway".'), stat("Banned", n.banned, "Never emailed.")],
            },
          ]}
        />
      </section>
    </div>
  );
}
