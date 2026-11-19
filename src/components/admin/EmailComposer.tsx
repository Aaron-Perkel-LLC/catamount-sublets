"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { type EmailAudience, type EmailResolution, EMAIL_LIMITS, isGroup, LEFT_OUT_REASONS, NAME_PLACEHOLDER, replyBody, type ReplyStarter, SURVEY_PLACEHOLDER } from "@/lib/email";
import { adminEmailCheck, adminEmailDelete, adminEmailSave, adminEmailSend, adminEmailTest } from "@/server/actions/admin-email";
import type { EmailCheck } from "@/server/services/email";
import { useAdmin } from "./AdminShell";
import { Card } from "./Card";
import { EmailFrame, Envelope } from "./EmailBits";
import { Pill } from "./Pill";
import { SegmentedControl } from "./SegmentedControl";
import { BTN, BTN_DANGER, BTN_PRIMARY, CARD_TITLE, CHOICE, DIALOG, FIELD, FIELD_LABEL, ICON_BTN, LABEL, LINK, MUTED, SELECT, TEXTAREA } from "./ui";

export interface ComposerPerson {
  id: string;
  name: string | null;
  email: string;
  state: "ok" | "stop_email" | "banned";
}
export interface ComposerRequest {
  id: number;
  kind: string;
  name: string;
  email: string;
  school: string | null;
}
interface Draft {
  subject: string;
  body: string;
  audience: EmailAudience;
  resolve: EmailResolution | null;
}

const STARTERS: { key: ReplyStarter; label: string; resolve: EmailResolution | null }[] = [
  { key: "approved", label: "Approved", resolve: "approve" },
  { key: "declined", label: "Declined", resolve: "decline" },
  { key: "blank", label: "Blank", resolve: null },
];
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const toValue = (a: EmailAudience) => (a.kind === "address" ? "one" : a.kind === "semester" ? `sem:${a.code}` : a.kind === "people" ? "picked" : a.kind);

/**
 * Write → check → send, on one screen. The left is the email: who it is to,
 * its subject and its words, saved as a draft a moment after each change.
 * The right is the check: one named recipient's email exactly as it will
 * arrive, rendered on the server by the function that sends, with arrows to
 * step through everyone, and under it who gets it and who is left out.
 *
 * Send can't be reached with anything unsaved: the buttons wait for the
 * save, and the server refuses an email that isn't the one last checked. A
 * group asks for the number of recipients typed back; one person marked
 * Stop email asks for "Send anyway". On a phone the two sides are tabs.
 */
export function EmailComposer({ id, initial, initialCheck, semesters, people, request }: { id: number; initial: Draft; initialCheck: EmailCheck | null; semesters: { code: string; name: string; posters: number }[]; people: ComposerPerson[]; request: ComposerRequest | null }) {
  const router = useRouter();
  const { href } = useAdmin();
  const uid = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<Draft>(initial);
  const [check, setCheck] = useState<EmailCheck | null>(initialCheck);
  const [at, setAt] = useState(initialCheck?.index ?? 0);
  // How many edits have been made, and how many of them the server has saved and checked.
  const [edits, setEdits] = useState(0);
  const [saved, setSaved] = useState(0);
  const [note, setNote] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [tab, setTab] = useState<"write" | "preview" | "to">("write");
  const [starter, setStarter] = useState<ReplyStarter>("approved");
  const [filter, setFilter] = useState("");
  const [typed, setTyped] = useState("");
  const [anyway, setAnyway] = useState(false);
  const [busy, start] = useTransition();
  const dirty = saved < edits;

  const edit = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setEdits((n) => n + 1);
    setNote(null);
  };

  // Save a moment after the last change; the answer carries the fresh check.
  useEffect(() => {
    if (edits === 0) return;
    const mine = edits;
    const timer = setTimeout(async () => {
      const r = await adminEmailSave(id, draft, at).catch(() => null);
      if (!r) return setNote({ tone: "error", text: "Couldn't reach the server, so this isn't saved yet. It will try again when you type." });
      if (!r.ok) return setNote({ tone: "error", text: r.error });
      setCheck(r.data);
      setAt(r.data.index);
      setSaved((n) => Math.max(n, mine));
    }, 600);
    return () => clearTimeout(timer);
    // `at` is left out on purpose: stepping through recipients is not an edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edits]);

  const step = (to: number) =>
    start(async () => {
      const r = await adminEmailCheck(id, to);
      if (r.ok) {
        setCheck(r.data);
        setAt(r.data.index);
      } else setNote({ tone: "error", text: r.error });
    });

  const group = isGroup(draft.audience);
  const picked = draft.audience.kind === "people" ? new Set(draft.audience.userIds) : new Set<string>();
  const shownPeople = useMemo(() => {
    const t = filter.trim().toLowerCase();
    return t ? people.filter((p) => `${p.name ?? ""} ${p.email}`.toLowerCase().includes(t)) : people;
  }, [people, filter]);
  const problems = check?.problems ?? {};
  const blocked = (check?.blockers.length ?? 0) > 0;
  const ready = Boolean(check) && !dirty && Object.keys(problems).length === 0 && !blocked && (check?.total ?? 0) > 0;
  const shownName = check?.recipients[at]?.name ?? check?.recipients[at]?.email ?? null;
  const leftOutWords = (c: EmailCheck) => {
    const stop = c.leftOut.filter((l) => l.reason === "stop_email").length;
    const banned = c.leftOut.length - stop;
    return [stop && `${stop} Stop email`, banned && `${banned} banned`].filter(Boolean).join(", ");
  };

  const pickTo = (v: string) => {
    if (v === "one") edit({ audience: { kind: "address", email: "" } });
    else if (v === "picked") edit({ audience: { kind: "people", userIds: [] } });
    else if (v.startsWith("sem:")) edit({ audience: { kind: "semester", code: v.slice(4) } });
    else edit({ audience: { kind: v as "board" | "everyone" | "survey" } });
  };
  const pickStarter = (s: ReplyStarter) => {
    if (!request) return;
    if (draft.body.trim() && draft.body !== replyBody(request, starter) && !confirm("Replace what you've written with this starting text?")) return;
    setStarter(s);
    edit({ body: replyBody(request, s), resolve: STARTERS.find((x) => x.key === s)!.resolve });
  };

  const test = () =>
    start(async () => {
      const r = await adminEmailTest(id, at);
      setNote(r.ok ? { tone: "ok", text: `Test sent to ${r.data.to}, as ${r.data.as} would get it.` } : { tone: "error", text: r.error });
    });
  const review = () => {
    setTyped("");
    setAnyway(false);
    dialog.current?.showModal();
  };
  const send = () =>
    start(async () => {
      if (!check) return;
      const r = await adminEmailSend(id, { check: check.check, typed: group ? Number(typed) : null, sendAnyway: anyway });
      dialog.current?.close();
      if (!r.ok) return setNote({ tone: "error", text: r.error });
      router.replace(href(`/admin/email/${id}`));
      router.refresh();
    });
  const discard = () =>
    confirm("Delete this draft?") &&
    start(async () => {
      const r = await adminEmailDelete(id);
      if (r.ok) router.push(href("/admin/email"));
      else setNote({ tone: "error", text: r.error });
    });

  const show = (t: typeof tab) => (tab === t ? "" : "max-lg:hidden");
  const canSend = ready && (group ? typed.trim() === String(check?.total) : check?.warning === "banned" ? false : check?.warning === "stop_email" ? anyway : true);

  return (
    <div className="flex flex-col gap-4">
      <SegmentedControl
        label="Part of the email"
        value={tab}
        onPick={setTab}
        className="lg:hidden"
        segments={[
          { key: "write", label: "Write" },
          { key: "preview", label: "Preview" },
          { key: "to", label: check ? `To · ${check.total}` : "To" },
        ]}
      />
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card title={request ? `Reply to ${request.name}` : "New email"} actions={<span className={LABEL}>{dirty ? "Saving…" : edits > 0 ? "Draft saved" : "Draft"}</span>} className={show("write")}>
          {request && (
            <fieldset className="flex flex-wrap items-center gap-x-4 text-[13px]">
              <legend className="sr-only">Start from</legend>
              <span className={LABEL}>
                {request.kind === "school" ? "School request" : "Access request"} #{request.id}. Start from
              </span>
              {STARTERS.map((s) => (
                <label key={s.key} className={CHOICE}>
                  <input type="radio" name={`${uid}-starter`} checked={starter === s.key} onChange={() => pickStarter(s.key)} />
                  {s.label}
                </label>
              ))}
            </fieldset>
          )}
          <div className={FIELD_LABEL}>
            <label htmlFor={`${uid}-to`}>To</label>
            {request ? (
              <p className="text-[13px] break-all text-ink">{request.email}</p>
            ) : (
              <select id={`${uid}-to`} className={SELECT} value={toValue(draft.audience)} onChange={(e) => pickTo(e.target.value)}>
                <option value="one">One person…</option>
                <option value="board">Posters on the board</option>
                {semesters.map((s) => (
                  <option key={s.code} value={`sem:${s.code}`}>
                    {s.name} posters ({s.posters})
                  </option>
                ))}
                <option value="everyone">Everyone with an account</option>
                <option value="survey">Haven&apos;t answered the survey</option>
                <option value="picked">Hand-picked…</option>
              </select>
            )}
            {!request && draft.audience.kind === "address" && (
              <input
                type="email"
                aria-label="Their email address"
                aria-invalid={problems.email ? true : undefined}
                className={FIELD}
                value={draft.audience.email}
                onChange={(e) => edit({ audience: { kind: "address", email: e.target.value } })}
                maxLength={EMAIL_LIMITS.email}
                autoComplete="off"
                spellCheck={false}
                placeholder="one address"
              />
            )}
            {draft.audience.kind === "people" && (
              <div className="flex flex-col gap-1.5">
                <input type="search" name="search_pick" aria-label="Find a person to tick" autoComplete="off" spellCheck={false} className={`${FIELD} appearance-none`} placeholder="Find by name or address" value={filter} onChange={(e) => setFilter(e.target.value)} />
                <ul className="grid max-h-56 grid-cols-1 gap-x-4 overflow-y-auto rounded-lg border border-line bg-paper px-3 py-1 sm:grid-cols-2">
                  {shownPeople.map((p) => (
                    <li key={p.id}>
                      <label className={`${CHOICE} ${p.state === "ok" ? "" : "text-ink-3"}`}>
                        <input
                          type="checkbox"
                          checked={picked.has(p.id)}
                          onChange={(e) => {
                            const next = new Set(picked);
                            if (e.target.checked) next.add(p.id);
                            else next.delete(p.id);
                            edit({ audience: { kind: "people", userIds: [...next] } });
                          }}
                        />
                        <span className="min-w-0 truncate">{p.name ? `${p.name} · ${p.email}` : p.email}</span>
                        {p.state !== "ok" && <Pill tone={p.state === "banned" ? "bad" : "warn"}>{LEFT_OUT_REASONS[p.state]}</Pill>}
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {problems.email && <span className="text-error-ink">{problems.email}</span>}
            {check && group && (
              <span>
                <span className="font-bold text-ink tabular-nums">{check.total}</span> will get it.
                {check.leftOut.length > 0 && (
                  <>
                    {" "}
                    <span className="font-bold text-ink tabular-nums">{check.leftOut.length}</span> left out: {leftOutWords(check)}.
                  </>
                )}
              </span>
            )}
            {check && !group && check.warning === "stop_email" && <span className="text-tenant-ink">This person is marked Stop email. Sending to them will ask you to confirm it.</span>}
            {check && !group && check.warning === "banned" && <span className="text-error-ink">This account is banned. Nothing is sent to a banned account.</span>}
          </div>
          <label className={FIELD_LABEL}>
            Subject
            <input className={FIELD} aria-invalid={problems.subject && edits > 0 ? true : undefined} value={draft.subject} onChange={(e) => edit({ subject: e.target.value })} maxLength={EMAIL_LIMITS.subject} />
          </label>
          <label className={FIELD_LABEL}>
            Message
            <textarea className={TEXTAREA} rows={11} value={draft.body} onChange={(e) => edit({ body: e.target.value })} maxLength={EMAIL_LIMITS.body} />
            <span>
              Plain text; a blank line starts a paragraph, and web and email addresses become links. {NAME_PLACEHOLDER} is their first name{group ? `, ${SURVEY_PLACEHOLDER} their own survey link` : ""}. The sign-off{group ? ", the unsubscribe link and the mailing address are" : " is"} added for you.
            </span>
          </label>
          {request && (
            <label className={FIELD_LABEL}>
              When it&apos;s sent
              <select className={`${SELECT} md:w-auto md:self-start`} value={draft.resolve ?? ""} onChange={(e) => edit({ resolve: (e.target.value || null) as EmailResolution | null })}>
                <option value="approve">Approve the request (they can sign in)</option>
                <option value="decline">Close the request as declined</option>
                <option value="">Leave the request open</option>
              </select>
            </label>
          )}
          {check && check.blockers.length > 0 && (
            <ul role="alert" className="flex flex-col gap-1 rounded-lg bg-error-tint px-3 py-2 text-[13px] text-error-ink">
              {check.blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={BTN} disabled={busy || !ready} onClick={test} title="Sends this email to your own address only">
              Send test to me
            </button>
            <button type="button" className={BTN_DANGER} disabled={busy} onClick={discard}>
              Delete draft
            </button>
            <button type="button" className={`${BTN_PRIMARY} ml-auto`} disabled={busy || !ready} onClick={review}>
              Review and send…
            </button>
          </div>
          {note && (
            <p role="status" className={`text-[13px] ${note.tone === "error" ? "text-error-ink" : "text-ink-2"}`}>
              {note.text}
            </p>
          )}
          {!note && !ready && check && !dirty && <p className={MUTED}>{check.total === 0 ? "Choose who it goes to." : (problems.subject ?? problems.body ?? problems.email ?? "")}</p>}
        </Card>

        <div className="flex min-w-0 flex-col gap-4">
          <Card
            title={shownName ? `What ${shownName.split(" ")[0]} gets` : "Preview"}
            className={show("preview")}
            actions={
              check && check.recipients.length > 1 ? (
                <span className="flex items-center gap-1.5">
                  <button type="button" className={ICON_BTN} aria-label="Previous recipient" disabled={busy || dirty || at === 0} onClick={() => step(at - 1)}>
                    <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                  </button>
                  <span className={`${LABEL} tabular-nums`}>
                    {at + 1} of {check.total}
                  </span>
                  <button type="button" className={ICON_BTN} aria-label="Next recipient" disabled={busy || dirty || at >= check.total - 1} onClick={() => step(at + 1)}>
                    <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </span>
              ) : undefined
            }
          >
            {check?.shown ? (
              <div className={`flex flex-col gap-3 ${dirty ? "opacity-50" : ""}`} aria-busy={dirty}>
                <Envelope
                  rows={[
                    ["From", check.shown.from],
                    ["Reply to", check.shown.replyTo],
                    ["To", check.shown.to],
                    ["Subject", check.shown.subject || "No subject yet"],
                  ]}
                />
                <EmailFrame html={check.shown.html} text={check.shown.text} />
              </div>
            ) : (
              <p className={MUTED}>Choose who it goes to and the email they get shows here, exactly as it will arrive.</p>
            )}
          </Card>
          {check && group && (
            <Card flush title="Who it goes to" className={show("to")} actions={<span className={`${MUTED} tabular-nums`}>{check.leftOut.length ? `${check.total} of ${check.total + check.leftOut.length}` : check.total}</span>}>
              {check.total + check.leftOut.length === 0 ? (
                <p className={`${MUTED} px-4`}>Nobody yet.</p>
              ) : (
                <ul className="max-h-80 divide-y divide-line-light overflow-y-auto border-t border-line-light">
                  {check.recipients.map((p, i) => (
                    <li key={p.email} className={`flex min-h-11 items-center justify-between gap-3 px-4 py-1.5 md:min-h-9 ${i === at ? "bg-notice-tint/60" : ""}`}>
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-[13px] font-bold">{p.name ?? p.email}</span>
                        {p.name && <span className="truncate text-xs text-ink-3">{p.email}</span>}
                      </span>
                      <button type="button" className={`${LINK} font-normal`} disabled={busy || dirty || i === at} onClick={() => step(i)}>
                        {i === at ? "Showing" : "Preview"}
                      </button>
                    </li>
                  ))}
                  {check.leftOut.map((p) => (
                    <li key={p.email} className="flex min-h-11 items-center justify-between gap-3 px-4 py-1.5 md:min-h-9">
                      <span className="flex min-w-0 flex-col text-ink-3">
                        <span className="truncate text-[13px]">{p.name ?? p.email}</span>
                        {p.name && <span className="truncate text-xs">{p.email}</span>}
                      </span>
                      <Pill tone={p.reason === "banned" ? "bad" : "warn"}>{LEFT_OUT_REASONS[p.reason]}</Pill>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>
      </div>

      <dialog ref={dialog} aria-label="Review and send" className={DIALOG} onClick={(e) => e.target === dialog.current && dialog.current?.close()}>
        {check && (
          <div className="flex flex-col gap-3 p-4">
            <h2 className={CARD_TITLE}>{group ? `Send to ${plural(check.total, "person", "people")}?` : `Send to ${check.recipients[0]?.email ?? "them"}?`}</h2>
            <Envelope
              rows={[
                ["From", check.shown?.from ?? ""],
                ["Subject", draft.subject],
              ]}
            />
            {group ? (
              <>
                <p className={MUTED}>
                  One email each, with their own name{draft.body.includes(SURVEY_PLACEHOLDER) ? " and survey link" : ""}, a one-click unsubscribe and the mailing address.
                  {check.leftOut.length > 0 && ` Left out: ${leftOutWords(check)}.`}
                </p>
                <label className={FIELD_LABEL}>
                  Type {check.total} to send
                  <input className={`${FIELD} md:w-32`} inputMode="numeric" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
                </label>
              </>
            ) : (
              <>
                {draft.resolve && <p className={MUTED}>Once it has gone, the request is {draft.resolve === "approve" ? "approved: they can sign in" : "closed as declined"}.</p>}
                {check.warning === "stop_email" && (
                  <label className={`${CHOICE} items-start rounded-lg bg-tenant-tint px-3 py-2 text-tenant-ink`}>
                    <input type="checkbox" className="mt-0.5 h-4 w-4" checked={anyway} onChange={(e) => setAnyway(e.target.checked)} />
                    <span>This person is marked Stop email. Send anyway (it is recorded that you did).</span>
                  </label>
                )}
                {check.warning === "banned" && <p className="text-[13px] text-error-ink">This account is banned. Nothing is sent to a banned account.</p>}
              </>
            )}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button type="button" className={BTN_PRIMARY} disabled={busy || !canSend} onClick={send}>
                {busy ? "Sending…" : group ? `Send ${plural(check.total, "email")}` : "Send"}
              </button>
              <button type="button" className={BTN} onClick={() => dialog.current?.close()}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </dialog>
    </div>
  );
}
