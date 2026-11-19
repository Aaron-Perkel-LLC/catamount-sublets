"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ADMIN_NAV } from "@/lib/admin-nav";
import { adminQuickFind } from "@/server/actions/admin";
import type { QuickFind } from "@/server/services/admin";
import { goAdmin } from "./go";
import { DIALOG } from "./ui";

type Hit = { kind: "section"; key: string; label: string; detail: string; href: string } | { kind: "listing"; key: string; label: string; detail: string; id: number } | { kind: "person"; key: string; label: string; detail: string; id: string };

const NOTHING: QuickFind = { listings: [], people: [] };
const SECTIONS = ADMIN_NAV.flatMap((g) => g.items.map((i) => ({ ...i, group: g.label })));

function sectionHits(q: string): Hit[] {
  const t = q.trim().toLowerCase();
  if (!t) return SECTIONS.map((s) => ({ kind: "section", key: `s-${s.id}`, label: s.label, detail: s.group, href: s.href }));
  return SECTIONS.filter((s) => `${s.label} ${s.group} ${s.keywords ?? ""}`.toLowerCase().includes(t)).map((s) => ({ kind: "section", key: `s-${s.id}`, label: s.label, detail: s.group, href: s.href }));
}

/** Typing in a field, so "/" is a character there and not the shortcut. */
function typing(target: EventTarget | null): boolean {
  const t = target as HTMLElement | null;
  return Boolean(t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)));
}

/**
 * Jump anywhere in the admin: a section by name, a listing by its number or
 * address, a person by name or email. Cmd/Ctrl-K anywhere, or "/" when not
 * typing in a field; on a phone, the search button.
 */
export function QuickJump({ href, openPost }: { href: (p: string) => string; openPost: (id: number) => Promise<void> }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const seq = useRef(0);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<QuickFind>({ listings: [], people: [] });
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(0);

  const show = () => {
    setQ("");
    setFound(NOTHING);
    setActive(0);
    dialog.current?.showModal();
    input.current?.focus();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        show();
      } else if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !typing(e.target) && !dialog.current?.open) {
        e.preventDefault();
        show();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const term = q.trim();
    const n = ++seq.current;
    if (!term) return;
    const timer = setTimeout(async () => {
      try {
        const r = await adminQuickFind(term);
        if (n === seq.current) setFound(r);
      } catch {
        if (n === seq.current) setFound({ listings: [], people: [] });
      } finally {
        if (n === seq.current) setBusy(false);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [q]);

  const shown = q.trim() ? found : NOTHING;
  const hits: Hit[] = [
    ...shown.listings.map((l): Hit => ({ kind: "listing", key: `l-${l.id}`, label: `#${l.id} ${l.label}`, detail: l.status === "open" ? "Listing" : `Listing (${l.status})`, id: l.id })),
    ...shown.people.map((p): Hit => ({ kind: "person", key: `p-${p.id}`, label: p.name ?? p.email, detail: p.name ? p.email : "Person", id: p.id })),
    ...sectionHits(q),
  ];
  const pick = Math.min(active, Math.max(0, hits.length - 1));

  const go = (hit: Hit | undefined) => {
    if (!hit) return;
    dialog.current?.close();
    if (hit.kind === "section") goAdmin(router, href(hit.href));
    else if (hit.kind === "listing") void openPost(hit.id);
    else goAdmin(router, href(`/admin/people#people:${hit.id}`));
  };

  return (
    <>
      <button
        type="button"
        onClick={show}
        aria-label="Find a person, listing or page"
        aria-keyshortcuts="Meta+K Control+K /"
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-line bg-paper text-[13px] text-ink-3 hover:border-lake hover:text-lake md:h-8 md:w-44 md:justify-start md:px-2.5"
      >
        <Search className="h-4 w-4 md:h-3.5 md:w-3.5" aria-hidden />
        <span className="hidden md:inline">Find…</span>
        <kbd className="ml-auto hidden rounded border border-line px-1 font-sans text-[11px] text-ink-3 md:inline">/</kbd>
      </button>
      <dialog
        ref={dialog}
        aria-label="Find in admin"
        className={`${DIALOG} max-md:mt-4`}
        onClick={(e) => e.target === dialog.current && dialog.current?.close()}
      >
        <div className="flex flex-col">
          <label className="flex items-center gap-2 border-b border-line px-3">
            <Search className="h-4 w-4 shrink-0 text-ink-3" aria-hidden />
            <span className="sr-only">Find a section, listing number or person</span>
            <input
              ref={input}
              className="min-h-12 w-full bg-transparent text-base outline-none"
              placeholder="Section, #listing, address, name or email"
              value={q}
              maxLength={100}
              role="combobox"
              aria-expanded="true"
              aria-controls="quick-jump-results"
              aria-activedescendant={hits[pick] ? `qj-${hits[pick].key}` : undefined}
              onChange={(e) => {
                setQ(e.target.value);
                setBusy(Boolean(e.target.value.trim()));
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((i) => Math.min(hits.length - 1, i + 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((i) => Math.max(0, i - 1));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  go(hits[pick]);
                }
              }}
            />
          </label>
          <ul id="quick-jump-results" role="listbox" className="max-h-[60dvh] overflow-y-auto p-1">
            {hits.map((h, i) => (
              <li
                key={h.key}
                id={`qj-${h.key}`}
                role="option"
                aria-selected={i === pick}
                onClick={() => go(h)}
                onPointerMove={() => setActive(i)}
                className={`flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-lg px-3 text-sm ${i === pick ? "bg-notice-tint text-lake" : ""}`}
              >
                <span className="truncate font-bold">{h.label}</span>
                <span className="shrink-0 truncate text-xs text-ink-3">{h.detail}</span>
              </li>
            ))}
            {hits.length === 0 && <li className="px-3 py-3 text-sm text-ink-3">{busy && q.trim() ? "Looking…" : "Nothing matches."}</li>}
          </ul>
        </div>
      </dialog>
    </>
  );
}
