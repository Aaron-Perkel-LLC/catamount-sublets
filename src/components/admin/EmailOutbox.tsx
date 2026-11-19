"use client";

import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import type { EmailStatus } from "@/lib/email";
import { adminEmailNew } from "@/server/actions/admin-email";
import { useAdmin } from "./AdminShell";
import { Card } from "./Card";
import { type Column, DataTable } from "./DataTable";
import { resultPill, whenLabel } from "./EmailBits";
import { Pill } from "./Pill";
import { SegmentedControl } from "./SegmentedControl";
import { BTN_PRIMARY, FIELD, LINK } from "./ui";

export interface OutboxRow {
  id: number;
  status: EmailStatus;
  subject: string;
  /** "Fall 2026 posters", or the one address. */
  to: string;
  group: boolean;
  /** When it was sent, or last edited while a draft. */
  at: string;
  sent: number;
  failed: number;
  leftOut: number;
  waiting: number;
  /** A reply's request, or why the one send failed. */
  note: string | null;
}

type Which = "all" | "drafts" | "failed";

/**
 * Email's home: everything written here, newest first, one row per email
 * whether it went to one person or to a group. A draft opens to be written;
 * anything sent opens to who got it. "New email" starts a blank draft.
 */
export function EmailOutbox({ rows }: { rows: OutboxRow[] }) {
  const router = useRouter();
  const { href } = useAdmin();
  const [which, setWhich] = useState<Which>("all");
  const [q, setQ] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const drafts = rows.filter((r) => r.status === "draft").length;
  const failed = rows.filter((r) => r.failed > 0).length;
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return rows.filter((r) => (which === "all" || (which === "drafts" ? r.status === "draft" : r.failed > 0)) && (!t || `${r.subject} ${r.to}`.toLowerCase().includes(t)));
  }, [rows, which, q]);

  const columns: Column<OutboxRow>[] = [
    {
      key: "subject",
      header: "Subject",
      primary: true,
      className: "md:w-full md:max-w-0",
      cell: (r) => (
        <span className="flex min-w-0 flex-col md:gap-px">
          <Link href={href(`/admin/email/${r.id}`)} className={`${LINK} max-w-full self-start`} title={r.subject || undefined}>
            <span className="truncate">{r.subject || "No subject yet"}</span>
          </Link>
          <span className="truncate text-xs font-normal text-ink-3">
            To {r.to || "nobody yet"}
            {r.group && r.status !== "draft" && ` · ${r.sent + r.failed + r.waiting}`}
            {r.note && ` · ${r.note}`}
          </span>
        </span>
      ),
    },
    { key: "when", header: "When", cell: (r) => <span className="text-ink-2">{r.status === "draft" ? `Edited ${whenLabel(r.at)}` : whenLabel(r.at)}</span> },
    {
      key: "result",
      header: "Result",
      cell: (r) => {
        const [tone, words] = resultPill(r);
        return <Pill tone={tone}>{words}</Pill>;
      },
    },
  ];

  return (
    <Card
      flush
      title="Everything sent from here"
      tip="One row per email, whether it went to one person or to a group. Open one to see exactly who got it and what happened. Tests to yourself aren't counted."
      actions={
        <button
          type="button"
          className={BTN_PRIMARY}
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await adminEmailNew({});
              if (r.ok) router.push(href(`/admin/email/${r.data.id}`));
              else setNote(r.error);
            })
          }
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          New email
        </button>
      }
    >
      <div className="flex flex-wrap items-center gap-2 px-4">
        <SegmentedControl
          label="Which emails"
          value={which}
          onPick={setWhich}
          className="w-full md:w-auto"
          segments={[
            { key: "all", label: "All" },
            { key: "drafts", label: drafts ? `Drafts ${drafts}` : "Drafts" },
            { key: "failed", label: failed ? `With failures ${failed}` : "With failures" },
          ]}
        />
        <label className="relative w-full md:ml-auto md:w-56">
          <span className="sr-only">Find an email by its subject or who it went to</span>
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-ink-3" aria-hidden />
          <input type="search" name="search_sent" autoComplete="off" spellCheck={false} className={`${FIELD} appearance-none pl-8 md:h-8 md:text-[13px]`} placeholder="Subject or who it went to" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>
      {note && (
        <p role="status" className="px-4 text-[13px] text-error-ink">
          {note}
        </p>
      )}
      <DataTable label="Emails" oneLine columns={columns} rows={shown} rowKey={(r) => r.id} empty={rows.length === 0 ? "Nothing written yet." : "No email matches."} />
    </Card>
  );
}
