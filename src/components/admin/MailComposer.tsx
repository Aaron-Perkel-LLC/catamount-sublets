"use client";

import { ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useId, useRef, useState, useTransition } from "react";
import { shortDate } from "@/lib/dates";
import { ADMIN_MAIL_LIMITS, adminMailContent, type AdminMailResolution, type AdminMailStatus, fieldErrors, replyBody, replySubject, type ReplyStarter } from "@/lib/admin-mail";
import { adminPreviewMail, adminSendMail } from "@/server/actions/admin";
import { Empty } from "./Card";
import { Pill, type PillTone } from "./Pill";
import { Tip } from "./Tip";
import { BTN, BTN_PRIMARY, FIELD, FIELD_LABEL, LABEL, SELECT, TEXTAREA } from "./ui";

/** A one-off email as the admin pages show it. */
export interface AdminMessageDto {
  id: number;
  recipient: string;
  subject: string;
  body: string;
  status: AdminMailStatus;
  error: string | null;
  accessRequestId: number | null;
  createdAt: string;
}

/** The access request a reply answers. */
export interface ReplyTarget {
  id: number;
  kind: string;
  name: string;
  email: string;
  school: string | null;
}

type Preview = { html: string; text: string; token: string; warning: string | null };
type Note = { tone: "ok" | "error"; text: string };

const STARTERS: { key: ReplyStarter; label: string; resolve: AdminMailResolution | "" }[] = [
  { key: "approved", label: "Approved", resolve: "approve" },
  { key: "declined", label: "Declined", resolve: "decline" },
  { key: "blank", label: "Blank", resolve: "" },
];

/**
 * Write → Preview → Send. Preview renders the email on the server exactly as
 * it will arrive and returns a token for that exact text; any edit throws the
 * preview away, so Send only ever sends what was just looked at. Send is its
 * own button, disabled while a send is in flight, and the token doubles as the
 * idempotency key, so a double click is one email.
 */
export function MailComposer({ request, onDone }: { request?: ReplyTarget; onDone?: () => void }) {
  const router = useRouter();
  const uid = useId();
  const [starter, setStarter] = useState<ReplyStarter>("approved");
  const [to, setTo] = useState(request?.email ?? "");
  const [subject, setSubject] = useState(request ? replySubject(request) : "");
  const [body, setBody] = useState(request ? replyBody(request, "approved") : "");
  const [resolve, setResolve] = useState<AdminMailResolution | "">(request ? "approve" : "");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [note, setNote] = useState<Note | null>(null);
  const [previewing, startPreview] = useTransition();
  const [sending, setSending] = useState(false);
  const lock = useRef(false);

  /** Every edit, to any field, invalidates the preview. */
  const edit =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPreview(null);
      setNote(null);
    };

  const pickStarter = (s: ReplyStarter) => {
    if (!request) return;
    if (body.trim() && body !== replyBody(request, starter) && !confirm("Replace what you've written with this starting text?")) return;
    setStarter(s);
    edit(setBody)(replyBody(request, s));
    setResolve(STARTERS.find((x) => x.key === s)!.resolve);
  };

  const doPreview = () => {
    const check = adminMailContent.safeParse({ to, subject, body });
    if (!check.success) {
      setErrors(fieldErrors(check.error));
      return;
    }
    setErrors({});
    startPreview(async () => {
      const r = await adminPreviewMail({ to, subject, body });
      if (r.ok) setPreview(r.data);
      else {
        setErrors(r.fieldErrors ?? {});
        setNote({ tone: "error", text: r.error });
      }
    });
  };

  const doSend = async () => {
    if (!preview || lock.current) return;
    lock.current = true;
    setSending(true);
    setNote(null);
    try {
      const r = await adminSendMail({ to, subject, body, accessRequestId: request?.id ?? null, resolve: resolve || null }, preview.token);
      if (r.ok) {
        const handled =
          r.data.resolved === "approved"
            ? " Request approved: they can sign in now."
            : r.data.resolved === "declined"
              ? " Request closed as declined."
              : r.data.resolved === "already_handled"
                ? " The request had already been handled."
                : "";
        setNote({ tone: "ok", text: r.data.duplicate ? "That message was already sent; nothing new went out." : `Sent to ${to}.${handled}` });
        setPreview(null);
        if (!request) {
          setTo("");
          setSubject("");
          setBody("");
        }
        router.refresh();
        onDone?.();
      } else {
        // A refused or failed send needs a fresh preview: its token is spent.
        setPreview(null);
        setErrors(r.fieldErrors ?? {});
        setNote({ tone: "error", text: r.error });
        router.refresh();
      }
    } catch {
      // The request itself failed, so it may or may not have gone. The preview is kept:
      // sending it again uses the same idempotency key, which cannot send twice.
      setNote({ tone: "error", text: "Couldn't reach the server. Check the history below, then press Send again if it isn't there: it won't send twice." });
    } finally {
      lock.current = false;
      setSending(false);
    }
  };

  const busy = previewing || sending;

  return (
    <div className="flex flex-col gap-3">
      {request && (
        <fieldset className="flex flex-wrap items-center gap-x-4 text-[13px]">
          <legend className="sr-only">Start from</legend>
          <span className={LABEL}>Start from</span>
          {STARTERS.map((s) => (
            <label key={s.key} className="flex min-h-11 items-center gap-1.5 md:min-h-8">
              <input type="radio" name={`starter-${request.id}`} checked={starter === s.key} onChange={() => pickStarter(s.key)} disabled={busy} />
              {s.label}
            </label>
          ))}
        </fieldset>
      )}
      <Field id={`${uid}-to`} label="To" error={errors.to}>
        <input
          id={`${uid}-to`}
          className={FIELD}
          type="email"
          value={to}
          onChange={(e) => edit(setTo)(e.target.value)}
          maxLength={ADMIN_MAIL_LIMITS.email}
          autoComplete="off"
          spellCheck={false}
          disabled={busy}
          placeholder="one address"
        />
      </Field>
      <Field id={`${uid}-subject`} label="Subject" error={errors.subject}>
        <input id={`${uid}-subject`} className={FIELD} value={subject} onChange={(e) => edit(setSubject)(e.target.value)} maxLength={ADMIN_MAIL_LIMITS.subject} disabled={busy} />
      </Field>
      <Field id={`${uid}-body`} label="Message" error={errors.body} tip="Plain text. A blank line starts a paragraph; web and email addresses become links. The sign-off and footer are added for you.">
        <textarea id={`${uid}-body`} className={TEXTAREA} rows={10} value={body} onChange={(e) => edit(setBody)(e.target.value)} maxLength={ADMIN_MAIL_LIMITS.body} disabled={busy} />
      </Field>
      {request && (
        <label className={FIELD_LABEL}>
          When it&apos;s sent
          <select className={`${SELECT} md:w-auto md:self-start`} value={resolve} onChange={(e) => edit(setResolve)(e.target.value as AdminMailResolution | "")} disabled={busy}>
            <option value="approve">Approve the request (they can sign in)</option>
            <option value="decline">Close the request as declined</option>
            <option value="">Leave the request open</option>
          </select>
        </label>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={BTN} onClick={doPreview} disabled={busy}>
          {previewing ? "Rendering…" : preview ? "Preview again" : "Preview"}
        </button>
        <button type="button" className={BTN_PRIMARY} onClick={doSend} disabled={!preview || busy} title={preview ? undefined : "Preview the message first"}>
          {sending ? "Sending…" : "Send"}
        </button>
        {onDone && (
          <button type="button" className={BTN} onClick={onDone} disabled={sending}>
            Cancel
          </button>
        )}
        {!preview && !note && <span className={LABEL}>Preview first; any edit means previewing again.</span>}
      </div>
      {note && (
        <p role="status" className={`text-[13px] ${note.tone === "error" ? "text-error-ink" : "text-ink-2"}`}>
          {note.text}
        </p>
      )}
      {preview && (
        <section aria-label="Email preview" className="flex flex-col gap-2">
          {preview.warning && (
            <p role="alert" className="rounded-lg bg-error-tint px-3 py-2 text-[13px] text-error-ink">
              {preview.warning}
            </p>
          )}
          <p className={LABEL}>
            This is exactly what <span className="font-bold text-ink-2">{to}</span> will get, subject &ldquo;{subject}&rdquo;.
          </p>
          <iframe title="Email preview" sandbox="" srcDoc={preview.html} className="h-[32rem] w-full rounded-lg border border-line bg-paper" />
          <details className="text-[13px]">
            <summary className="cursor-pointer py-3.5 text-ink-3 hover:text-lake md:py-1.5">Plain-text version</summary>
            <pre className="overflow-x-auto rounded-lg border border-line bg-paper p-3 text-xs whitespace-pre-wrap">{preview.text}</pre>
          </details>
        </section>
      )}
    </div>
  );
}

/**
 * A labelled field with its error under it. The label points at the control
 * by id instead of wrapping it, so a `tip` (whose ⓘ is a button) can sit
 * beside the label without becoming the thing the label names.
 */
function Field({ id, label, error, tip, children }: { id: string; label: string; error?: string; tip?: string; children: ReactNode }) {
  const name = <label htmlFor={id}>{label}</label>;
  return (
    <div className={FIELD_LABEL}>
      {tip ? (
        <Tip text={tip} flat label="About this field" className="self-start">
          {name}
        </Tip>
      ) : (
        name
      )}
      {children}
      {error && <span className="text-error-ink">{error}</span>}
    </div>
  );
}

const STATUS: Record<AdminMailStatus, { tone: PillTone; label: string }> = {
  sent: { tone: "good", label: "Sent" },
  failed: { tone: "bad", label: "Failed" },
  pending: { tone: "muted", label: "Pending" },
};

/**
 * Sends, newest first, as rows that run edge to edge (inside a flush Card,
 * or pulled out to a padded card's edges): to whom and what, when, and
 * whether it went as a pill (a failure's error is its hover). A row opens to
 * the message itself. Without the recipient (inside the request it answers)
 * a row is one line.
 */
export function MailHistory({ messages, showRecipient = true }: { messages: AdminMessageDto[]; showRecipient?: boolean }) {
  if (messages.length === 0) {
    return (
      <div className="px-4">
        <Empty>Nothing sent yet.</Empty>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-line-light border-t border-line-light">
      {messages.map((m) => (
        <li key={m.id}>
          <details className="group">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 px-4 py-2 hover:bg-cream/70 md:min-h-9 [&::-webkit-details-marker]:hidden">
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[13px] font-bold group-open:break-words group-open:whitespace-normal">{showRecipient ? m.recipient : m.subject}</span>
                {showRecipient && (
                  <span className="truncate text-xs text-ink-3 group-open:whitespace-normal">
                    {m.subject}
                    {m.accessRequestId && ` · reply to request #${m.accessRequestId}`}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-xs text-ink-3 tabular-nums">{shortDate(new Date(m.createdAt))}</span>
              <Pill tone={STATUS[m.status].tone} title={m.error ?? undefined}>
                {STATUS[m.status].label}
              </Pill>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-3 group-open:rotate-180" aria-hidden />
            </summary>
            <div className="flex flex-col gap-1 px-4 pb-3">
              {m.error && <p className="text-xs text-error-ink">{m.error}</p>}
              <p className="text-[13px] whitespace-pre-line text-ink-2">{m.body}</p>
            </div>
          </details>
        </li>
      ))}
    </ul>
  );
}
