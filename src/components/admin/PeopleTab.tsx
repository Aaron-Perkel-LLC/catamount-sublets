"use client";

import { MoreHorizontal, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { shortDate } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import { LISTING_STATUSES, type ListingStatus } from "@/lib/options";
import { highlightParts, PEOPLE_QUERY_MAX } from "@/lib/people-search";
import { adminDeletePerson, adminSearchPeople, adminSetBanned, adminSetNoEmail } from "@/server/actions/admin";
import type { PersonDto } from "./AdminTabs";
import { SortHeader, useSort } from "./SortHeader";
import type { SortDir } from "./sort";

type Key = "name" | "joined" | "lastIn" | "post";
const COLUMNS: { key: Key; label: string; firstDir: SortDir }[] = [
  { key: "name", label: "Name", firstDir: "asc" },
  { key: "joined", label: "Joined", firstDir: "desc" },
  { key: "lastIn", label: "Last sign-in", firstDir: "desc" },
  { key: "post", label: "Post", firstDir: "desc" },
];
const value = (p: PersonDto, k: Key) => (k === "name" ? (p.name ?? p.email) : k === "joined" ? p.createdAt : k === "lastIn" ? p.lastLoginAt : (p.post?.id ?? null));

/**
 * Everyone with an account, newest first, and each one's post: the chip opens
 * the listing view with the admin's controls on top. `focus` is a row to
 * scroll to and flash (a Poster link from Activity).
 */
export function PeopleTab({
  people,
  initialSearch,
  meId,
  focus,
  onOpenPost,
}: {
  people: PersonDto[];
  initialSearch: { q: string; ids: string[] | null };
  meId: string;
  focus: { id: string; n: number } | null;
  onOpenPost: (id: number) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const { sorted, sort, setSort, onSort } = useSort<PersonDto, Key>(people, value, { key: "joined", dir: "desc" });
  const { q, setQ, matchedQ, matches, busy, error, inputRef, clear } = usePeopleSearch(initialSearch);
  const shown = matches ? sorted.filter((p) => matches.has(p.id)) : sorted;
  const mark = (text: string) => <Highlight text={text} q={matchedQ} />;

  useEffect(() => {
    if (focus) document.querySelector(`[data-person="${focus.id}"]`)?.scrollIntoView({ block: "center" });
  }, [focus]);

  const ban = (p: PersonDto) => {
    const reason = p.banned ? null : prompt("Reason (kept in the database, never shown to them):", "Banned by the admin.");
    if (!p.banned && reason === null) return;
    start(async () => {
      const r = await adminSetBanned(p.id, !p.banned, reason);
      setNote(r.ok ? (p.banned ? "Unbanned." : "Banned and signed out everywhere.") : r.error);
      if (r.ok) router.refresh();
    });
  };

  const mail = (p: PersonDto) =>
    start(async () => {
      const r = await adminSetNoEmail(p.id, !p.noEmail);
      setNote(r.ok ? (p.noEmail ? `${p.name ?? p.email} will get announcement emails again.` : `${p.name ?? p.email} will get no more announcement emails.`) : r.error);
      if (r.ok) router.refresh();
    });

  const remove = (p: PersonDto) =>
    start(async () => {
      const dry = await adminDeletePerson(p.id, true);
      if (!dry.ok) return setNote(dry.error);
      const d = dry.data;
      const who = p.name ? `${p.name} (${d.email})` : d.email;
      if (!confirm(`Delete ${who}? Their account, ${d.listingId ? `listing #${d.listingId} with ${d.photos} photo(s) and ${d.events} activity events` : "no listing"}, and ${d.sessions} session(s). This cannot be undone.`)) return;
      const r = await adminDeletePerson(p.id, false);
      setNote(r.ok ? `Deleted ${p.name ?? r.data.email}.` : r.error);
      if (r.ok) router.refresh();
    });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <label className="relative flex w-full max-w-sm items-center">
          <span className="sr-only">Search people</span>
          <Search className="pointer-events-none absolute left-2.5 h-4 w-4 text-ink-3" aria-hidden />
          <input
            ref={inputRef}
            type="search"
            className="field w-full py-1.5 pr-8 pl-8 text-sm [&::-webkit-search-cancel-button]:hidden"
            placeholder="Search name, email or id  ( / )"
            maxLength={PEOPLE_QUERY_MAX}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setQ("")}
            autoComplete="off"
            spellCheck={false}
          />
          {q && (
            <button type="button" className="absolute right-1.5 rounded p-1 text-ink-3 hover:text-ink" aria-label="Clear search" onClick={clear}>
              <X className="h-4 w-4" aria-hidden />
            </button>
          )}
        </label>
        <span className="text-xs text-ink-3" aria-live="polite">
          {error ?? (busy ? "Searching…" : matches ? `${shown.length} of ${people.length}` : "")}
        </span>
      </div>
      {/* Phone: the date columns fold under the name, so the sort gets its own control. */}
      <label className="flex items-center gap-2 self-start text-sm text-ink-2 md:hidden">
        Sort by
        <select
          className="field w-auto py-1 text-sm"
          value={`${sort.key}:${sort.dir}`}
          onChange={(e) => {
            const [key, dir] = e.target.value.split(":") as [Key, SortDir];
            setSort({ key, dir });
          }}
        >
          <option value="joined:desc">Newest</option>
          <option value="joined:asc">Oldest</option>
          <option value="name:asc">Name, A to Z</option>
          <option value="name:desc">Name, Z to A</option>
          <option value="lastIn:desc">Last sign-in</option>
          <option value="lastIn:asc">Longest since sign-in</option>
          <option value="post:desc">Post, newest</option>
          <option value="post:asc">Post, oldest</option>
        </select>
      </label>
      {note && (
        <p role="status" className="text-sm text-ink-2">
          {note}
        </p>
      )}
      {matches && shown.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-3">No people match &ldquo;{matchedQ}&rdquo;.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-ink-3">
            <tr>
              {COLUMNS.map((c) => (
                <SortHeader
                  key={c.key}
                  label={c.label}
                  column={c.key}
                  sort={sort}
                  onSort={onSort}
                  firstDir={c.firstDir}
                  className={c.key === "joined" || c.key === "lastIn" ? "hidden md:table-cell" : ""}
                />
              ))}
              <th>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((p) => (
              // Keyed by the focus too, so a second visit to the same row plays the flash again.
              <tr
                key={focus?.id === p.id ? `${p.id}:${focus.n}` : p.id}
                data-person={p.id}
                className={`border-t border-line-light align-top ${focus?.id === p.id ? "animate-row-flash" : ""}`}
              >
                <td className="py-2 pr-3">
                  <div className="flex flex-wrap items-center gap-1">
                    <span className={p.name ? "font-bold" : "break-all text-ink-2"}>{mark(p.name ?? p.email)}</span>
                    {p.role === "admin" && <Chip tone="notice">admin</Chip>}
                    {p.legacyNetid && <Chip tone="plain">migrated</Chip>}
                    {p.banned && (
                      <Chip tone="error" title={p.banReason ?? ""}>
                        banned
                      </Chip>
                    )}
                    {p.noEmail && <Chip tone="plain">no email</Chip>}
                  </div>
                  {p.name && <div className="text-xs break-all text-ink-3">{mark(p.email)}</div>}
                  <div className="text-xs text-ink-3 md:hidden">
                    Joined {shortDate(new Date(p.createdAt))} · {p.lastLoginAt ? `last in ${shortDate(new Date(p.lastLoginAt))}` : "never signed in"}
                  </div>
                </td>
                <td className="hidden py-2 pr-3 whitespace-nowrap md:table-cell">{shortDate(new Date(p.createdAt))}</td>
                <td className="hidden py-2 pr-3 whitespace-nowrap md:table-cell">{p.lastLoginAt ? shortDate(new Date(p.lastLoginAt)) : <span className="text-ink-3">never</span>}</td>
                <td className="py-2 pr-3">
                  {p.post ? (
                    <div className="flex flex-wrap items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onOpenPost(p.post!.id)}
                        className="rounded-full border border-line bg-paper px-2 py-0.5 text-xs font-bold whitespace-nowrap text-lake hover:border-lake"
                        title={`${p.post.shortAddress} · ${p.post.semesterLabel}`}
                      >
                        #{p.post.id} · {formatMoney(p.post.price)}
                      </button>
                      {p.post.status !== "open" && <Chip tone="plain">{LISTING_STATUSES[p.post.status as ListingStatus] ?? p.post.status}</Chip>}
                      {p.post.hidden && <Chip tone="tenant">hidden</Chip>}
                    </div>
                  ) : (
                    <span className="text-ink-3">—</span>
                  )}
                </td>
                <td className="py-1 text-right">
                  {p.id !== meId && p.role !== "admin" && (
                    <details className="relative inline-block text-left">
                      <summary className="icon-btn list-none [&::-webkit-details-marker]:hidden" aria-label={`Actions for ${p.name ?? p.email}`}>
                        <MoreHorizontal className="h-4 w-4" aria-hidden />
                      </summary>
                      <div className="absolute right-0 z-10 mt-1 flex w-36 flex-col rounded-lg border border-line bg-paper p-1 shadow-lg">
                        <button
                          type="button"
                          className="rounded px-3 py-2 text-left text-sm hover:bg-line-light"
                          disabled={pending}
                          onClick={(e) => {
                            e.currentTarget.closest("details")?.removeAttribute("open");
                            ban(p);
                          }}
                        >
                          {p.banned ? "Unban" : "Ban…"}
                        </button>
                        <button
                          type="button"
                          className="rounded px-3 py-2 text-left text-sm hover:bg-line-light"
                          disabled={pending}
                          onClick={(e) => {
                            e.currentTarget.closest("details")?.removeAttribute("open");
                            mail(p);
                          }}
                        >
                          {p.noEmail ? "Allow email" : "Stop email"}
                        </button>
                        <button
                          type="button"
                          className="rounded px-3 py-2 text-left text-sm text-error-ink hover:bg-error-tint"
                          disabled={pending}
                          onClick={(e) => {
                            e.currentTarget.closest("details")?.removeAttribute("open");
                            remove(p);
                          }}
                        >
                          Delete…
                        </button>
                      </div>
                    </details>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/**
 * The search box's state. Matching happens on the server (adminSearchPeople)
 * across every account; the table then shows the rows whose ids came back.
 * The query lives in ?q= so a reload or a pasted link lands on the same
 * search, and "/" focuses the box from anywhere on the tab.
 */
function usePeopleSearch(initial: { q: string; ids: string[] | null }) {
  const [q, setQ] = useState(initial.q);
  const [matchedQ, setMatchedQ] = useState(initial.q);
  const [matches, setMatches] = useState<Set<string> | null>(initial.ids ? new Set(initial.ids) : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    const term = q.trim();
    if (term === matchedQ) return;
    const n = ++seq.current;
    const timer = setTimeout(async () => {
      const url = new URL(window.location.href);
      if (term) url.searchParams.set("q", term);
      else url.searchParams.delete("q");
      history.replaceState(history.state, "", url);
      if (!term) {
        setMatches(null);
        setMatchedQ("");
        setError(null);
        return;
      }
      setBusy(true);
      try {
        const r = await adminSearchPeople(term);
        if (n !== seq.current) return; // a later keystroke owns the result
        setError(r.ok ? null : r.error);
        if (r.ok) {
          setMatches(new Set(r.data.ids));
          setMatchedQ(term);
        }
      } catch {
        if (n === seq.current) setError("Search failed. Try again.");
      } finally {
        if (n === seq.current) setBusy(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [q, matchedQ]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return {
    q,
    setQ,
    matchedQ,
    matches,
    busy,
    error,
    inputRef,
    clear: () => {
      setQ("");
      inputRef.current?.focus();
    },
  };
}

function Highlight({ text, q }: { text: string; q: string }) {
  return (
    <>
      {highlightParts(text, q).map((part, i) =>
        part.hit ? (
          <mark key={i} className="rounded-sm bg-notice-tint text-inherit">
            {part.text}
          </mark>
        ) : (
          part.text
        ),
      )}
    </>
  );
}

const TONES = {
  plain: "bg-line-light text-ink-2",
  notice: "bg-notice-tint text-notice-ink",
  tenant: "bg-tenant-tint text-tenant-ink",
  error: "bg-error-tint text-error-ink",
} as const;

function Chip({ tone, title, children }: { tone: keyof typeof TONES; title?: string; children: ReactNode }) {
  return (
    <span className={`rounded-full px-1.5 text-xs whitespace-nowrap ${TONES[tone]}`} title={title}>
      {children}
    </span>
  );
}
