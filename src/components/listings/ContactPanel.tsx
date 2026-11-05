"use client";

import { ArrowLeft, Copy, Mail, MessageSquare, Phone } from "lucide-react";
import { useEffect, useState } from "react";
import { SITE } from "@/config/site";
import { copyToClipboard } from "@/lib/clipboard";
import { formatMoney } from "@/lib/format";
import type { EventSource, EventType } from "@/lib/options";
import { track } from "@/lib/track";
import { fetchContactDetails } from "@/server/actions/listings";
import type { ContactDetails, ListingDto } from "@/server/data/listings";
import type { Viewer } from "./listing-view";

type Kind = "email" | "phone";

/** A Copy button that says "Copied!" or "Copy failed" for a moment. */
export function CopyButton({ text, onCopy, label = "Copy" }: { text: () => string; onCopy?: () => void; label?: string }) {
  const [state, setState] = useState<"idle" | "ok" | "fail">("idle");
  useEffect(() => {
    if (state === "idle") return;
    const t = setTimeout(() => setState("idle"), 1600);
    return () => clearTimeout(t);
  }, [state]);
  return (
    <button
      type="button"
      className={`btn-secondary gap-1.5 px-3 py-1.5 text-sm ${state === "ok" ? "border-included-line bg-included-tint text-included-ink" : ""} ${state === "fail" ? "border-error-line bg-error-tint text-error-ink" : ""}`}
      onClick={async () => {
        onCopy?.();
        setState((await copyToClipboard(text())) ? "ok" : "fail");
      }}
    >
      <Copy className="h-4 w-4" aria-hidden />
      {state === "ok" ? "Copied!" : state === "fail" ? "Copy failed" : label}
    </button>
  );
}

/**
 * The Email and Call panels. Contact details arrive when the panel opens
 * (never with the card). Every tap in here is counted by type.
 */
export function ContactPanel({
  listing,
  kind,
  source,
  viewer,
  onBack,
}: {
  listing: ListingDto;
  kind: Kind;
  source: EventSource;
  viewer: Viewer;
  onBack: () => void;
}) {
  const [details, setDetails] = useState<ContactDetails | null | "loading" | "error">("loading");
  const [draft, setDraft] = useState("");

  // Mounted per (listing, kind) by the parent's key, so "loading" is the
  // initial state and nothing needs resetting here.
  useEffect(() => {
    let cancelled = false;
    fetchContactDetails(listing.id).then(
      (d) => {
        if (cancelled) return;
        setDetails(d);
        if (d) setDraft(emailDraft(listing, d, viewer));
      },
      () => !cancelled && setDetails("error"),
    );
    return () => {
      cancelled = true;
    };
  }, [listing, viewer]);

  const log = (type: EventType) => track(type, listing.id, source);

  return (
    <div className="flex flex-col gap-4">
      <button type="button" className="link inline-flex items-center gap-1 self-start text-sm" onClick={onBack}>
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back to listing
      </button>
      <h3 className="text-lg font-bold">{kind === "email" ? "Send an email" : "Call or text"}</h3>

      {details === "loading" && <p className="text-sm text-ink-3">Loading…</p>}
      {details === "error" && <p className="text-sm text-error-ink">Couldn&apos;t load the contact details. Try again in a moment.</p>}
      {details === null && <p className="text-sm text-ink-3">This listing isn&apos;t up any more.</p>}

      {details !== null && typeof details === "object" && kind === "email" && (
        <>
          <Field label="To">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold">{details.email}</span>
              <CopyButton text={() => details.email} onCopy={() => log("copy_email")} />
            </div>
          </Field>
          <Field label="Subject">
            <span>{emailSubject(listing)}</span>
          </Field>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-bold">
              Message <span className="font-normal text-ink-3">(yours to edit)</span>
            </span>
            <textarea className="field min-h-44" rows={7} value={draft} onChange={(e) => setDraft(e.target.value)} />
          </label>
          <div className="flex flex-wrap gap-2">
            <a
              href={mailto(details.email, emailSubject(listing), draft)}
              className="btn-primary gap-2"
              onClick={() => log("mail_app")}
            >
              <Mail className="h-4 w-4" aria-hidden /> Open in your email app
            </a>
            <CopyButton text={() => draft} onCopy={() => log("copy_message")} label="Copy message" />
          </div>
          <p className="text-xs leading-5 text-ink-3">
            Everyone here signed in with a verified student email. If no email app opens (Instagram&apos;s browser often
            won&apos;t), copy the address and message instead.
          </p>
        </>
      )}

      {details !== null && typeof details === "object" && kind === "phone" && details.phone && (
        <>
          <Field label="Phone number">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xl font-bold">{details.phone}</span>
              <CopyButton text={() => details.phone ?? ""} onCopy={() => log("copy_phone")} />
            </div>
          </Field>
          <div className="flex flex-wrap gap-2">
            <a href={`tel:${encodeURIComponent(details.phone)}`} className="btn-primary gap-2" onClick={() => log("dial")}>
              <Phone className="h-4 w-4" aria-hidden /> Call
            </a>
            <a href={`sms:${encodeURIComponent(details.phone)}`} className="btn-secondary gap-2" onClick={() => log("text")}>
              <MessageSquare className="h-4 w-4" aria-hidden /> Text
            </a>
          </div>
        </>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-bold">{label}</span>
      <div className="text-ink-2">{children}</div>
    </div>
  );
}

export function emailSubject(listing: ListingDto): string {
  return `Your sublet at ${listing.shortAddress} (${SITE.name})`;
}

/**
 * Greets the poster by the name they chose (an email local part is not a
 * name), and signs with the viewer's real name only.
 */
export function emailDraft(listing: ListingDto, details: ContactDetails, viewer: Viewer): string {
  const greeting = details.posterName ? `Hi ${details.posterName.split(" ")[0]},` : "Hi there,";
  const semester = listing.semesterLabel ? `, ${listing.semesterLabel}` : "";
  return (
    `${greeting}\n\n` +
    `I found your sublet at ${listing.shortAddress} on ${SITE.name} (${formatMoney(listing.price)}/mo${semester}) and I’m interested. ` +
    `Is it still available? I’d love to hear a bit more about it, and to see it if that works for you.\n\n` +
    `Thanks!${viewer.signature ? `\n${viewer.signature}` : ""}`
  );
}

function mailto(to: string, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
