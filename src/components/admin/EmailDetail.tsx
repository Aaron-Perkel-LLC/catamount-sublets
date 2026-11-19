"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { type DeliveryStatus, type EmailStatus, LEFT_OUT_REASONS, type LeftOutReason } from "@/lib/email";
import { adminEmailCopy, adminEmailCopyFor, adminEmailRetry } from "@/server/actions/admin-email";
import type { Rendered } from "@/server/services/email";
import { useAdmin } from "./AdminShell";
import { Card } from "./Card";
import { type Column, DataTable } from "./DataTable";
import { EmailFrame, Envelope, resultPill, whenLabel } from "./EmailBits";
import { KpiRow } from "./KpiCard";
import { Pill, type PillTone } from "./Pill";
import { SegmentedControl } from "./SegmentedControl";
import { BTN, LINK, MUTED } from "./ui";

export interface DetailEmail {
  id: number;
  status: EmailStatus;
  subject: string;
  to: string;
  group: boolean;
  from: string;
  sentAt: string;
  requestId: number | null;
  resolve: string | null;
}
export interface DetailRecipient {
  id: number;
  name: string | null;
  /** Null once the person's account is gone. */
  address: string | null;
  status: DeliveryStatus;
  reason: string | null;
  test: boolean;
  overridden: boolean;
  at: string | null;
}

const TONE: Record<DeliveryStatus, [PillTone, string]> = { sent: ["good", "Sent"], failed: ["bad", "Failed"], left_out: ["outline", "Left out"], queued: ["muted", "Waiting"], sending: ["warn", "Sending"] };
type Which = "all" | "failed" | "left_out";

/**
 * An email that has gone, or is going: its result, the email itself as one
 * recipient got it, and a row per recipient. Picking a recipient shows their
 * copy. "Retry failed" sends again only to the ones it didn't reach, and
 * can't reach anyone twice. While it is still sending the page refreshes
 * itself.
 */
export function EmailDetail({ email, recipients, first }: { email: DetailEmail; recipients: DetailRecipient[]; first: { id: number; copy: Rendered } | null }) {
  const router = useRouter();
  const { href } = useAdmin();
  const [which, setWhich] = useState<Which>("all");
  const [shown, setShown] = useState(first);
  const [note, setNote] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const real = recipients.filter((r) => !r.test);
  const n = (s: DeliveryStatus) => real.filter((r) => r.status === s).length;
  const counts = { sent: n("sent"), failed: n("failed"), leftOut: n("left_out"), waiting: n("queued") + n("sending") };
  const [tone, words] = resultPill({ status: email.status, group: email.group, ...counts });
  const rows = useMemo(() => recipients.filter((r) => which === "all" || r.status === which), [recipients, which]);

  useEffect(() => {
    if (email.status !== "sending") return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [email.status, router]);

  const open = (r: DetailRecipient) =>
    start(async () => {
      const c = await adminEmailCopyFor(email.id, r.id);
      if (c.ok) setShown({ id: r.id, copy: c.data });
      else setNote(c.error);
    });

  const columns: Column<DetailRecipient>[] = [
    {
      key: "who",
      header: "Person",
      primary: true,
      className: "md:w-full md:max-w-0",
      cell: (r) => (
        <span className="flex min-w-0 flex-col md:gap-px">
          {r.address && !r.test ? (
            <button type="button" className={`${LINK} max-w-full self-start text-left`} disabled={busy} onClick={() => open(r)}>
              <span className="truncate">{r.name ?? r.address}</span>
            </button>
          ) : (
            <span className="truncate text-ink-3">{r.test ? "Test to you" : "Account deleted"}</span>
          )}
          <span className="truncate text-xs font-normal text-ink-3">
            {r.status === "left_out" ? (LEFT_OUT_REASONS[r.reason as LeftOutReason] ?? r.reason) : r.status === "failed" ? r.reason : r.test ? `As ${r.name ?? "a recipient"} would get it` : r.name ? r.address : ""}
            {r.overridden && " · Stop email, sent anyway"}
          </span>
        </span>
      ),
    },
    { key: "at", header: "When", cell: (r) => (r.at ? <span className="text-ink-2">{whenLabel(r.at)}</span> : null) },
    { key: "result", header: "Result", cell: (r) => <Pill tone={r.test ? "outline" : TONE[r.status][0]}>{r.test ? (r.status === "sent" ? "Test" : "Test failed") : TONE[r.status][1]}</Pill> },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Link href={href("/admin/email")} className={`${LINK} font-normal`}>
          ← All email
        </Link>
        <h2 className="min-w-0 text-[15px] font-bold [overflow-wrap:anywhere]">{email.subject}</h2>
        <Pill tone={tone}>{words}</Pill>
        <span className="flex flex-wrap gap-2 md:ml-auto">
          {counts.failed > 0 && email.status === "sent" && (
            <button
              type="button"
              className={BTN}
              disabled={busy}
              onClick={() =>
                start(async () => {
                  const r = await adminEmailRetry(email.id);
                  setNote(r.ok ? `Trying ${r.data.queued} again.` : r.error);
                  router.refresh();
                })
              }
            >
              Retry {counts.failed} failed
            </button>
          )}
          <button
            type="button"
            className={BTN}
            disabled={busy}
            onClick={() =>
              start(async () => {
                const r = await adminEmailCopy(email.id);
                if (r.ok) router.push(href(`/admin/email/${r.data.id}`));
                else setNote(r.error);
              })
            }
          >
            Use as a new draft
          </button>
        </span>
      </div>
      {note && (
        <p role="status" className="text-[13px] text-ink-2">
          {note}
        </p>
      )}
      {email.group && (
        <KpiRow
          kpis={[
            { key: "sent", label: "Sent", value: String(counts.sent), of: `/ ${counts.sent + counts.failed + counts.waiting}` },
            { key: "failed", label: "Failed", value: String(counts.failed), tip: "Each was tried up to three times. Retry sends only to these, and can't reach anyone twice." },
            { key: "out", label: "Left out", value: String(counts.leftOut), tip: "In the group when it was sent, but banned or marked Stop email." },
            { key: "waiting", label: "Still to go", value: String(counts.waiting), tip: "Queued, or waiting to be tried again. The hourly job finishes anything left." },
          ]}
        />
      )}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <Card title={shown && email.group ? "The email, as one person got it" : "The email"}>
          <Envelope
            rows={[
              ["From", email.from],
              ["To", shown && email.group ? shown.copy.to : email.to],
              ["Sent", `${whenLabel(email.sentAt)}${email.group ? `, to ${email.to} as the list stood then` : ""}`],
              ...(email.requestId ? ([["Request", `#${email.requestId}${email.resolve ? `, ${email.resolve === "approve" ? "approved" : "declined"} once it went` : ", left open"}`]] as [string, string][]) : []),
            ]}
          />
          {shown ? <EmailFrame html={shown.copy.html} text={shown.copy.text} /> : <p className={MUTED}>Nobody was sent this, so there is no copy to show.</p>}
        </Card>
        <Card
          flush
          title={email.group ? "Who got it" : "What happened"}
          actions={
            email.group && (counts.failed > 0 || counts.leftOut > 0) ? (
              <SegmentedControl
                label="Which recipients"
                value={which}
                onPick={setWhich}
                segments={[
                  { key: "all", label: `All ${real.length}` },
                  { key: "failed", label: `Failed ${counts.failed}` },
                  { key: "left_out", label: `Left out ${counts.leftOut}` },
                ]}
              />
            ) : undefined
          }
        >
          <DataTable label="Recipients" oneLine rows={rows} rowKey={(r) => r.id} rowProps={(r) => (r.id === shown?.id ? { className: "bg-notice-tint/60" } : {})} columns={columns} empty="Nobody here." />
        </Card>
      </div>
    </div>
  );
}
