"use client";

import Link from "next/link";
import { useId, useState, useTransition } from "react";
import { DIGEST } from "@/config/site";
import { digestWhen } from "@/lib/digest";
import { deleteSearchAction, renameSearchAction, setDigestAction } from "@/server/actions/digest";
import type { MyAlerts, MySavedSearch } from "@/server/services/digest";

/**
 * Account → Alerts: the weekly email's one switch and the saved searches it
 * covers (open on Browse, rename, delete). The email is opt-in: off until
 * the person turns it on here or with "Save and email me weekly" on Browse.
 */
export function SavedSearches({ alerts, email, noEmail }: { alerts: MyAlerts; email: string; noEmail: boolean }) {
  const [on, setOn] = useState(alerts.digestOn);
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const switchId = useId();

  const toggle = () =>
    start(async () => {
      setNote(null);
      const r = await setDigestAction({ enabled: !on });
      if (r.ok) {
        setOn(r.data.enabled);
        setNote(r.data.enabled ? `On. The next one comes ${digestWhen()}, if anything new matches.` : "Off. Your searches stay saved.");
      } else setNote(r.error);
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 rounded-xl border border-line p-4">
        <div className="flex items-center justify-between gap-4">
          <label htmlFor={switchId} className="flex flex-col">
            <span className="font-bold">Weekly email</span>
            <span className="text-sm text-ink-2">
              {digestWhen()}s, to {email}: new listings matching any search below. Nothing is sent in a week when nothing new matches.
            </span>
          </label>
          <button
            id={switchId}
            type="button"
            role="switch"
            aria-checked={on}
            disabled={pending}
            onClick={toggle}
            className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-60 ${on ? "bg-lake" : "bg-line"}`}
          >
            <span className={`absolute top-0.5 size-6 rounded-full bg-paper shadow transition-[left] ${on ? "left-[1.375rem]" : "left-0.5"}`} />
            <span className="sr-only">{on ? "On" : "Off"}</span>
          </button>
        </div>
        {on && noEmail && <p className="text-sm text-notice-ink">You asked us earlier to stop sending you email, so the weekly email stays off until that&apos;s lifted. Reply to any email from us to change it.</p>}
        {on && alerts.searches.length === 0 && <p className="text-sm text-ink-2">It goes out once you save a search on Browse.</p>}
        <p role="status" aria-live="polite" className="text-sm text-ink-2 empty:hidden">
          {note}
        </p>
      </div>

      {alerts.searches.length === 0 ? (
        <p className="text-sm text-ink-2">
          No saved searches yet. Set the filters on{" "}
          <Link href="/browse" className="link">
            Browse
          </Link>{" "}
          and press &ldquo;Get alerts for this search&rdquo;.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-xl border border-line">
          {alerts.searches.map((s) => (
            <SearchRow key={s.id} search={s} />
          ))}
        </ul>
      )}
      <p className="text-xs text-ink-3">
        {alerts.searches.length} of {alerts.max} searches. Your own listing is never in the email.
      </p>
    </div>
  );
}

function SearchRow({ search }: { search: MySavedSearch }) {
  const [mode, setMode] = useState<"view" | "rename" | "delete">("view");
  const [name, setName] = useState(search.name);
  const [shownName, setShownName] = useState(search.name);
  const [gone, setGone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const nameId = useId();
  if (gone) return null;

  return (
    <li className="flex flex-col gap-2 p-4">
      {mode === "rename" ? (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              setError(null);
              const r = await renameSearchAction({ id: search.id, name });
              if (r.ok) {
                setShownName(name.trim());
                setMode("view");
              } else setError(r.error);
            });
          }}
        >
          <label htmlFor={nameId} className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-bold">
            Name
            <input id={nameId} className="field font-normal" value={name} maxLength={DIGEST.savedSearchNameMaxChars} onChange={(e) => setName(e.target.value)} required autoFocus />
          </label>
          <button type="submit" className="btn-primary py-2 text-sm" disabled={pending}>
            Save
          </button>
          <button type="button" className="btn-secondary py-2 text-sm" onClick={() => { setName(shownName); setMode("view"); }}>
            Cancel
          </button>
        </form>
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-bold break-words">{shownName}</p>
            <p className="text-sm text-ink-2">{search.summary}</p>
          </div>
          {mode === "view" && (
            <div className="flex gap-3 text-sm">
              <Link href={search.href} className="link">
                View
              </Link>
              <button type="button" className="link" onClick={() => setMode("rename")}>
                Rename
              </button>
              <button type="button" className="link text-error-ink" onClick={() => setMode("delete")}>
                Delete
              </button>
            </div>
          )}
        </div>
      )}
      {mode === "delete" && (
        <div role="alertdialog" aria-label={`Delete ${shownName}?`} className="flex flex-wrap items-center gap-2 rounded-lg border border-error-line bg-error-tint p-3 text-sm">
          <span>Delete this search? It leaves your weekly email.</span>
          <button
            type="button"
            className="rounded-lg bg-error-ink px-3 py-1.5 font-bold text-paper disabled:opacity-50"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setError(null);
                const r = await deleteSearchAction({ id: search.id });
                if (r.ok) setGone(true);
                else setError(r.error);
              })
            }
          >
            Delete
          </button>
          <button type="button" className="btn-secondary py-1.5 text-sm" onClick={() => setMode("view")}>
            Keep it
          </button>
        </div>
      )}
      {error && <p className="text-sm text-error-ink">{error}</p>}
    </li>
  );
}
