import type { ReactNode } from "react";
import { SITE_TIME_ZONE } from "@/lib/dates";
import type { EmailStatus } from "@/lib/email";
import type { PillTone } from "./Pill";

/** The small shared parts of the admin's Email pages: an email's envelope, the rendered copy, and how a result reads. */

/** A row of label and value each, for an email's From, To and Subject. */
export function Envelope({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 gap-y-1 text-[13px]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-ink-3">{k}</dt>
          <dd className="min-w-0 [overflow-wrap:anywhere] text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** One recipient's email, rendered: sandboxed, so nothing in it runs or loads. */
export function EmailFrame({ html, text }: { html: string; text: string }) {
  return (
    <>
      <iframe title="Email preview" sandbox="" srcDoc={html} className="h-[30rem] w-full rounded-lg border border-line bg-paper" />
      <details className="text-[13px]">
        <summary className="cursor-pointer py-3.5 text-ink-3 hover:text-lake md:py-1.5">Plain-text version</summary>
        <pre className="overflow-x-auto rounded-lg border border-line bg-paper p-3 text-xs whitespace-pre-wrap">{text}</pre>
      </details>
    </>
  );
}

const WHEN = new Intl.DateTimeFormat("en-US", { timeZone: SITE_TIME_ZONE, month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true });

/**
 * "Nov 19, 9:10 am", Eastern. Put together from the parts, because the
 * separators a whole formatted string uses differ between Node and Safari
 * (a narrow space before "AM" in one, a plain one in the other), which would
 * make the server's page and the browser's disagree.
 */
export function whenLabel(iso: string): string {
  const part = Object.fromEntries(WHEN.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${part.month} ${part.day}, ${part.hour}:${part.minute} ${(part.dayPeriod ?? "").toLowerCase()}`;
}

export interface ResultCounts {
  status: EmailStatus;
  group: boolean;
  sent: number;
  failed: number;
  waiting: number;
}

/** An email's result in a pill: "Draft", "Sending 18 of 43", "41 sent · 2 failed", or for one person just "Sent" or "Failed". */
export function resultPill(r: ResultCounts): [PillTone, string] {
  if (r.status === "draft") return ["muted", "Draft"];
  const total = r.sent + r.failed + r.waiting;
  if (r.status === "sending") return ["warn", r.group ? `Sending ${r.sent} of ${total}` : "Sending"];
  if (!r.group) return r.failed > 0 ? ["bad", "Failed"] : r.sent > 0 ? ["good", "Sent"] : ["muted", "Not sent"];
  if (r.failed > 0) return ["bad", `${r.sent} sent · ${r.failed} failed`];
  return r.sent > 0 ? ["good", `${r.sent} sent`] : ["muted", "Nobody to send to"];
}
