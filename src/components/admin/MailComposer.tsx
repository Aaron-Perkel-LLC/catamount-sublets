"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { shortDate } from "@/lib/dates";
import { ADMIN_MAIL_LIMITS, adminMailContent, type AdminMailResolution, type AdminMailStatus, fieldErrors, replyBody, replySubject, type ReplyStarter } from "@/lib/admin-mail";
import { adminPreviewMail, adminSendMail } from "@/server/actions/admin";

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
        <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <legend className="sr-only">Start from</legend>
          <span className="text-ink-3">Start from</span>
          {STARTERS.map((s) => (
            <label key={s.key} className="flex items-center gap-1.5">
              <input type="radio" name={`starter-${request.id}`} checked={starter === s.key} onChange={() => pickStarter(s.key)} disabled={busy} />
              {s.label}
            </label>
          ))}
        </fieldset>
      )}
      <Field label="To" error={errors.to}>
        <input
          className="field"
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
      <Field label="Subject" error={errors.subject}>
        <input className="field" value={subject} onChange={(e) => edit(setSubject)(e.target.value)} maxLength={ADMIN_MAIL_LIMITS.subject} disabled={busy} />
      </Field>
      <Field label="Message" error={errors.body} hint="Plain text. A blank line starts a paragraph; web and email addresses become links. The sign-off and footer are added for you.">
        <textarea className="field font-[inherit]" rows={10} value={body} onChange={(e) => edit(setBody)(e.target.value)} maxLength={ADMIN_MAIL_LIMITS.body} disabled={busy} />
      </Field>
      {request && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-bold">When it&apos;s sent</span>
          <select className="field w-auto self-start" value={resolve} onChange={(e) => edit(setResolve)(e.target.value as AdminMailResolution | "")} disabled={busy}>
            <option value="approve">Approve the request (they can sign in)</option>
            <option value="decline">Close the request as declined</option>
            <option value="">Leave the request open</option>
          </select>
        </label>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-secondary" onClick={doPreview} disabled={busy}>
          {previewing ? "Rendering…" : preview ? "Preview again" : "Preview"}
        </button>
        <button type="button" className="btn-primary" onClick={doSend} disabled={!preview || busy} title={preview ? undefined : "Preview the message first"}>
          {sending ? "Sending…" : "Send"}
        </button>
        {onDone && (
          <button type="button" className="btn-secondary" onClick={onDone} disabled={sending}>
            Cancel
          </button>
        )}
        {!preview && !note && <span className="text-xs text-ink-3">Preview first; any edit means previewing again.</span>}
      </div>
      {note && (
        <p role="status" className={`text-sm ${note.tone === "error" ? "text-error-ink" : "text-ink-2"}`}>
          {note.text}
        </p>
      )}
      {preview && (
        <section aria-label="Email preview" className="flex flex-col gap-2">
          {preview.warning && (
            <p role="alert" className="rounded-lg bg-error-tint px-3 py-2 text-sm text-error-ink">
              {preview.warning}
            </p>
          )}
          <p className="text-xs text-ink-3">
            This is exactly what <span className="font-bold">{to}</span> will get, subject &ldquo;{subject}&rdquo;.
          </p>
          <iframe title="Email preview" sandbox="" srcDoc={preview.html} className="h-[32rem] w-full rounded-lg border border-line bg-paper" />
          <details className="text-sm">
            <summary className="cursor-pointer text-ink-3">Plain-text version</summary>
            <pre className="mt-1 overflow-x-auto rounded-lg border border-line bg-paper p-3 text-xs whitespace-pre-wrap">{preview.text}</pre>
          </details>
        </section>
      )}
    </div>
  );
}

function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-bold">{label}</span>
      {children}
      {hint && !error && <span className="text-xs text-ink-3">{hint}</span>}
      {error && <span className="text-xs text-error-ink">{error}</span>}
    </label>
  );
}

/** Sends, newest first: when, to whom, what, and whether it went. */
export function MailHistory({ messages, showRecipient = true }: { messages: AdminMessageDto[]; showRecipient?: boolean }) {
  if (messages.length === 0) return <p className="text-sm text-ink-3">Nothing sent yet.</p>;
  return (
    <ul className="flex flex-col divide-y divide-line-light">
      {messages.map((m) => (
        <li key={m.id} className="py-2 text-sm">
          <details>
            <summary className="flex cursor-pointer flex-wrap items-baseline gap-x-2">
              <span className="text-xs text-ink-3">{shortDate(new Date(m.createdAt))}</span>
              <StatusChip status={m.status} />
              {showRecipient && <span className="break-all">{m.recipient}</span>}
              <span className="font-bold">{m.subject}</span>
              {showRecipient && m.accessRequestId && <span className="text-xs text-ink-3">reply to request #{m.accessRequestId}</span>}
            </summary>
            {m.error && <p className="mt-1 text-xs text-error-ink">{m.error}</p>}
            <p className="mt-1 text-sm whitespace-pre-line text-ink-2">{m.body}</p>
          </details>
        </li>
      ))}
    </ul>
  );
}

function StatusChip({ status }: { status: AdminMailStatus }) {
  const tone = status === "sent" ? "bg-notice-tint text-notice-ink" : status === "failed" ? "bg-error-tint text-error-ink" : "bg-line-light text-ink-2";
  return <span className={`rounded-full px-1.5 text-xs ${tone}`}>{status}</span>;
}
