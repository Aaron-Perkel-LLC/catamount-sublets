"use client";

import { MoreHorizontal, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { shortDate } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import { LISTING_STATUSES, type ListingStatus } from "@/lib/options";
import { highlightParts, PEOPLE_QUERY_MAX } from "@/lib/people-search";
import { adminDeletePerson, adminSearchPeople, adminSetBanned, adminSetNoEmail } from "@/server/actions/admin";
import { type Column, DataTable } from "./DataTable";
import { Pill } from "./Pill";
import type { SortDir } from "./sort";
import type { PersonDto } from "./types";
import { FIELD, LINK, MUTED, SELECT } from "./ui";
import { useSort } from "./useSort";

type Key = "name" | "joined" | "lastIn" | "post";
const value = (p: PersonDto, k: Key) => (k === "name" ? (p.name ?? p.email) : k === "joined" ? p.createdAt : k === "lastIn" ? p.lastLoginAt : (p.post?.id ?? null));

/**
 * Everyone with an account, newest first, and each one's post: its number
 * opens the listing view with the admin's controls on top. A card per person
 * on a phone, with the ⋯ menu in the card's corner. `focus` is a row to
 * scroll to and flash (a Poster link from All listings, a quick-jump hit).
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
      setNote(r.ok ? (p.banned ? "Unbanned." : "Banned, signed out everywhere, and their listing is off the board.") : r.error);
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
      if (!confirm(`Delete ${who}? Their account, ${d.listingId ? `listing #${d.listingId} with ${d.photos} photo(s) (its ${d.events} activity events stay, with no name or email)` : "no listing"}, ${d.sessions} session(s)${d.messages ? `, and the ${d.messages} email(s) you sent them` : ""}. This cannot be undone.`)) return;
      const r = await adminDeletePerson(p.id, false);
      setNote(r.ok ? `Deleted ${p.name ?? r.data.email}.` : r.error);
      if (r.ok) router.refresh();
    });

  const columns: Column<PersonDto, Key>[] = [
    {
      key: "name",
      header: "Name",
      primary: true,
      sort: "name",
      // Room for the ⋯ menu, which sits in the card's corner on a phone.
      className: "max-md:pr-10",
      cell: (p) => (
        <span className="flex flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className={p.name ? "font-bold" : "break-all text-ink-2"}>{mark(p.name ?? p.email)}</span>
            {p.role === "admin" && <Pill tone="info">Admin</Pill>}
            {p.legacyNetid && <Pill>Migrated</Pill>}
            {p.banned && (
              <Pill tone="bad" title={p.banReason ?? ""}>
                Banned
              </Pill>
            )}
            {p.noEmail && <Pill>No email</Pill>}
          </span>
          {p.name && <span className="text-xs break-all text-ink-3">{mark(p.email)}</span>}
        </span>
      ),
    },
    { key: "joined", header: "Joined", sort: "joined", firstDir: "desc", className: "whitespace-nowrap tabular-nums", cell: (p) => shortDate(new Date(p.createdAt)) },
    { key: "lastIn", header: "Last sign-in", sort: "lastIn", firstDir: "desc", className: "whitespace-nowrap tabular-nums", cell: (p) => (p.lastLoginAt ? shortDate(new Date(p.lastLoginAt)) : <span className="text-ink-3">Never</span>) },
    {
      key: "post",
      header: "Post",
      sort: "post",
      firstDir: "desc",
      className: "max-md:col-span-2 max-md:items-center",
      cell: (p) =>
        p.post ? (
          <span className="flex flex-wrap items-center gap-1.5 max-md:justify-end">
            <button type="button" onClick={() => onOpenPost(p.post!.id)} className={`${LINK} tabular-nums whitespace-nowrap`} title={`${p.post.shortAddress} · ${p.post.semesterLabel}`}>
              #{p.post.id} · {formatMoney(p.post.price)}
            </button>
            {p.post.status !== "open" && <Pill tone={p.post.status === "taken" ? "info" : "muted"}>{LISTING_STATUSES[p.post.status as ListingStatus] ?? p.post.status}</Pill>}
            {p.post.hidden && <Pill tone="warn">Hidden</Pill>}
          </span>
        ) : null,
    },
    {
      key: "actions",
      header: "",
      bare: true,
      // With a pointer, the row's last cell; on a phone, the card's top right corner.
      className: "w-px md:py-1 md:text-right max-md:absolute max-md:top-1 max-md:right-2 max-md:w-auto max-md:pt-0",
      cell: (p) =>
        p.id !== meId && p.role !== "admin" ? (
          <RowMenu
            label={`Actions for ${p.name ?? p.email}`}
            disabled={pending}
            items={[
              { label: p.banned ? "Unban" : "Ban…", run: () => ban(p) },
              { label: p.noEmail ? "Allow email" : "Stop email", run: () => mail(p) },
              { label: "Delete…", danger: true, run: () => remove(p) },
            ]}
          />
        ) : null,
    },
  ];

  // The row is found by data-person; keyed by the focus too, so a second visit to the same row plays the flash again.
  const rowProps = (p: PersonDto) => ({ "data-person": p.id, className: `relative ${focus?.id === p.id ? "animate-row-flash" : ""}` });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 px-4">
        <label className="relative flex w-full items-center md:w-80">
          <span className="sr-only">Search people</span>
          <Search className="pointer-events-none absolute left-3 h-4 w-4 text-ink-3" aria-hidden />
          <input
            ref={inputRef}
            type="search"
            className={`${FIELD} pr-11 pl-9 md:pr-9 [&::-webkit-search-cancel-button]:hidden`}
            placeholder="Search name, email or id"
            maxLength={PEOPLE_QUERY_MAX}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setQ("")}
            autoComplete="off"
            spellCheck={false}
          />
          {q && (
            <button type="button" className="absolute right-0 grid h-11 w-11 place-items-center rounded-lg text-ink-3 hover:text-ink md:h-9 md:w-9" aria-label="Clear search" onClick={clear}>
              <X className="h-4 w-4" aria-hidden />
            </button>
          )}
        </label>
        {/* Phone: a card has no column headers, so the sort gets its own control. */}
        <select
          aria-label="Sort by"
          className={`${SELECT} w-auto md:hidden`}
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
        <span className={`${MUTED} ml-auto tabular-nums`} aria-live="polite">
          {error ?? (busy ? "Searching…" : matches ? `${shown.length} of ${people.length}` : `${people.length} ${people.length === 1 ? "person" : "people"}`)}
        </span>
      </div>
      {note && (
        <p role="status" className={`${MUTED} px-4`}>
          {note}
        </p>
      )}
      <DataTable
        label="People"
        columns={columns}
        rows={shown}
        rowKey={(p) => (focus?.id === p.id ? `${p.id}:${focus.n}` : p.id)}
        rowProps={rowProps}
        sort={sort}
        onSort={onSort}
        empty={matches ? `No people match “${matchedQ}”.` : "No people yet."}
      />
    </div>
  );
}

/**
 * A row's ⋯ menu. It is drawn fixed, under its button (above it at the foot
 * of the screen): the table scrolls sideways inside its card, which would
 * clip a menu drawn in place on the last rows. A click outside, Escape, a
 * scroll or a resize closes it.
 */
function RowMenu({ label, disabled, items }: { label: string; disabled: boolean; items: { label: string; danger?: boolean; run: () => void }[] }) {
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useLayoutEffect(() => {
    const b = button.current?.getBoundingClientRect();
    const el = menu.current;
    if (!open || !b || !el) return;
    const m = el.getBoundingClientRect();
    const edge = 8;
    const below = b.bottom + 4;
    el.style.top = `${below + m.height > window.innerHeight - edge ? Math.max(edge, b.top - 4 - m.height) : below}px`;
    el.style.left = `${Math.max(edge, Math.min(b.right - m.width, document.documentElement.clientWidth - edge - m.width))}px`;
    el.style.visibility = "visible";
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const away = (e: PointerEvent) => {
      if (!menu.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node)) close();
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      close();
      button.current?.focus();
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    window.addEventListener("scroll", close, { capture: true, passive: true });
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
      window.removeEventListener("scroll", close, { capture: true });
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`inline-grid h-11 w-11 place-items-center rounded-lg text-ink-3 hover:bg-line-light hover:text-ink md:h-8 md:w-8 ${open ? "bg-line-light text-ink" : ""}`}
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden />
      </button>
      {open && (
        <div ref={menu} className="invisible fixed z-40 flex w-40 flex-col rounded-lg border border-line bg-paper p-1 text-left shadow-lg">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              disabled={disabled}
              className={`flex min-h-11 items-center rounded-md px-3 text-left text-[13px] disabled:opacity-50 md:min-h-8 ${item.danger ? "text-error-ink hover:bg-error-tint" : "hover:bg-line-light"}`}
              onClick={() => {
                setOpen(false);
                item.run();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

/**
 * The search box's state. Matching happens on the server (adminSearchPeople)
 * across every account; the table then shows the rows whose ids came back.
 * The query lives in ?q= so a reload or a pasted link lands on the same
 * search. ("/" opens the admin's quick-jump box, which finds people too.)
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
