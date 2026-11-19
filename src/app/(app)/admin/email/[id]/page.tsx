import { notFound } from "next/navigation";
import { EmailComposer } from "@/components/admin/EmailComposer";
import { EmailDetail } from "@/components/admin/EmailDetail";
import { SITE } from "@/config/site";
import { getDb } from "@/db";
import { semesters } from "@/db/schema";
import { audienceLabel, isGroup } from "@/lib/email";
import { sql } from "drizzle-orm";
import { requireAdminPage } from "@/server/auth";
import { listPendingAccessRequests } from "@/server/data/access-requests";
import { getEmail, listDeliveries } from "@/server/data/emails";
import { listPeople } from "@/server/services/admin";
import { checkEmail, sentCopy } from "@/server/services/email";

/** One email: a draft opens in the composer; anything sent opens to what went and who got it. */
export default async function AdminEmailOne({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  await requireAdminPage(`/admin/email/${raw}`);
  const id = Number(raw);
  if (!/^\d{1,9}$/.test(raw) || id <= 0) notFound();
  const db = await getDb();
  const e = await getEmail(db, id);
  if (!e) notFound();

  if (e.status === "draft") {
    const [check, sems, people, requests] = await Promise.all([
      checkEmail(db, id, 0),
      db
        .select({ code: semesters.code, name: semesters.name, posters: sql<number>`(select count(distinct ls.listing_id) from listing_semesters ls where ls.semester_code = ${semesters.code})::int` })
        .from(semesters)
        .where(sql`${semesters.archivedAt} is null`)
        .orderBy(semesters.sortOrder),
      listPeople(db),
      e.accessRequestId ? listPendingAccessRequests(db) : [],
    ]);
    const request = requests.find((r) => r.id === e.accessRequestId) ?? null;
    return (
      <EmailComposer
        id={id}
        initial={{ subject: e.subject, body: e.body, audience: e.audience, resolve: e.resolve }}
        initialCheck={check.ok ? check.data : null}
        semesters={sems.filter((s) => Number(s.posters) > 0 || (e.audience.kind === "semester" && e.audience.code === s.code)).map((s) => ({ ...s, posters: Number(s.posters) }))}
        people={people.map((p) => ({ id: p.id, name: p.name, email: p.email, state: p.banned ? "banned" : p.noEmail ? "stop_email" : "ok" }))}
        request={request && { id: request.id, kind: request.kind, name: request.name, email: request.email, school: request.school }}
      />
    );
  }

  const deliveries = await listDeliveries(db, id);
  const firstSent = deliveries.find((d) => !d.test && d.address && d.status === "sent") ?? deliveries.find((d) => !d.test && d.address);
  const copy = firstSent ? await sentCopy(db, id, firstSent.id) : null;
  return (
    <EmailDetail
      email={{
        id,
        status: e.status,
        subject: e.subject,
        to: e.toLabel ?? audienceLabel(e.audience),
        group: isGroup(e.audience),
        from: e.sender === "group" ? SITE.mailFromGroup : SITE.mailFromPersonal,
        sentAt: (e.sentAt ?? e.createdAt).toISOString(),
        requestId: e.accessRequestId,
        resolve: e.resolve,
      }}
      recipients={deliveries.map((d) => ({ id: d.id, name: d.name, address: d.address, status: d.status, reason: d.reason, test: d.test, overridden: d.overridden, at: (d.sentAt ?? d.lastAttemptAt)?.toISOString() ?? null }))}
      first={firstSent && copy?.ok ? { id: firstSent.id, copy: copy.data } : null}
    />
  );
}
