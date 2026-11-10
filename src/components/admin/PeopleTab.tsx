"use client";

import { MoreHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { shortDate } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import { LISTING_STATUSES, type ListingStatus } from "@/lib/options";
import { adminDeletePerson, adminSetBanned, adminSetNoEmail } from "@/server/actions/admin";
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
export function PeopleTab({ people, meId, focus, onOpenPost }: { people: PersonDto[]; meId: string; focus: { id: string; n: number } | null; onOpenPost: (id: number) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const { sorted, sort, setSort, onSort } = useSort<PersonDto, Key>(people, value, { key: "joined", dir: "desc" });

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
          {sorted.map((p) => (
            // Keyed by the focus too, so a second visit to the same row plays the flash again.
            <tr
              key={focus?.id === p.id ? `${p.id}:${focus.n}` : p.id}
              data-person={p.id}
              className={`border-t border-line-light align-top ${focus?.id === p.id ? "animate-row-flash" : ""}`}
            >
              <td className="py-2 pr-3">
                <div className="flex flex-wrap items-center gap-1">
                  <span className={p.name ? "font-bold" : "break-all text-ink-2"}>{p.name ?? p.email}</span>
                  {p.role === "admin" && <Chip tone="notice">admin</Chip>}
                  {p.legacyNetid && <Chip tone="plain">migrated</Chip>}
                  {p.banned && (
                    <Chip tone="error" title={p.banReason ?? ""}>
                      banned
                    </Chip>
                  )}
                  {p.noEmail && <Chip tone="plain">no email</Chip>}
                </div>
                {p.name && <div className="text-xs break-all text-ink-3">{p.email}</div>}
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
    </div>
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
