"use client";

import { Bell, BellRing } from "lucide-react";
import Link from "next/link";
import { useId, useState, useTransition } from "react";
import { DIGEST } from "@/config/site";
import { digestWhen } from "@/lib/digest";
import { saveSearchAction } from "@/server/actions/digest";

export interface SaveSearchProps {
  /** Browse's filters as a query string (filterSearchParams); the server makes it canonical. */
  query: string;
  /** The filters in words, offered as the name. */
  suggestedName: string;
  digestOn: boolean;
  savedCount: number;
  /** These filters are already one of the person's saved searches. */
  alreadySaved: boolean;
}

/**
 * "Get alerts for this search". Opens a small panel to name the search; when
 * the weekly email is off, the save button says it turns the email on
 * ("Save and email me weekly"), and that press is the opt-in. Saving never
 * turns mail on silently.
 */
export function SaveSearchButton({ query, suggestedName, digestOn, savedCount, alreadySaved }: SaveSearchProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(suggestedName);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ digestOn: boolean } | null>(null);
  const [pending, start] = useTransition();
  const panelId = useId();
  const nameId = useId();

  // A new filter set (the page re-renders with new props) starts over.
  const [forQuery, setForQuery] = useState(query);
  if (forQuery !== query) {
    setForQuery(query);
    setName(suggestedName);
    setSaved(null);
    setError(null);
    setOpen(false);
  }

  if (alreadySaved || saved) {
    const on = saved ? saved.digestOn : digestOn;
    return (
      <span role="status" className="flex items-center gap-1.5 text-sm text-ink-2">
        <BellRing aria-hidden className="size-4 text-lake" />
        {saved ? "Saved." : "Saved search."}{" "}
        <Link href="/account#alerts" className="link">
          {on ? `New matches come ${digestWhen()}s` : "Turn on the weekly email"}
        </Link>
      </span>
    );
  }

  const full = savedCount >= DIGEST.maxSavedSearches;
  return (
    <div className="relative">
      <button type="button" className="btn-secondary flex items-center gap-1.5 py-1.5 text-sm" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((o) => !o)}>
        <Bell aria-hidden className="size-4" />
        Get alerts for this search
      </button>
      {open && (
        <div id={panelId} role="group" aria-label="Get alerts for this search" className="absolute right-0 z-20 mt-2 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-3 rounded-2xl border border-line bg-paper p-4 shadow-lg">
          {full ? (
            <p className="text-sm text-ink-2">
              You have {DIGEST.maxSavedSearches} saved searches, the most there can be.{" "}
              <Link href="/account#alerts" className="link">
                Delete one on Account
              </Link>{" "}
              to save this one.
            </p>
          ) : (
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                start(async () => {
                  setError(null);
                  const r = await saveSearchAction({ query, name, enableDigest: !digestOn });
                  if (r.ok) setSaved({ digestOn: r.data.digestOn });
                  else setError(r.error);
                });
              }}
            >
              <label htmlFor={nameId} className="flex flex-col gap-1 text-sm font-bold">
                Name
                <input id={nameId} className="field font-normal" value={name} maxLength={DIGEST.savedSearchNameMaxChars} onChange={(e) => setName(e.target.value)} required />
              </label>
              <p className="text-sm text-ink-2">
                {digestOn
                  ? `It joins your weekly email: new listings matching any of your searches, ${digestWhen()}s.`
                  : `One email a week, ${digestWhen()}s, with new listings that match, and none when nothing new does. Unsubscribe from any email or from Account.`}
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="submit" className="btn-primary py-1.5 text-sm" disabled={pending}>
                  {pending ? "Saving…" : digestOn ? "Save search" : "Save and email me weekly"}
                </button>
                <button type="button" className="btn-secondary py-1.5 text-sm" onClick={() => setOpen(false)}>
                  Cancel
                </button>
              </div>
              <p role="status" aria-live="polite" className="text-sm text-error-ink empty:hidden">
                {error}
              </p>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
