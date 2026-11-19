"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ListingViewProvider, useListingView, type Viewer } from "@/components/listings/listing-view";
import { ADMIN_NAV, type AdminNavGroup, type AdminNavItem, navItemFor } from "@/lib/admin-nav";
import { resolveRange } from "@/lib/admin-range";
import { dayLabel } from "@/lib/chart";
import { adminLoadListing } from "@/server/actions/admin";
import { AdminPostActions } from "./AdminPostActions";
import { PageHeader } from "./PageHeader";
import { CountBadge } from "./Pill";
import { QuickJump } from "./QuickJump";
import { RangeControl } from "./RangeControl";
import { Tip } from "./Tip";

interface AdminApi {
  /** Opens a listing in the admin's listing view, from any section. */
  openPost: (id: number) => Promise<void>;
  /** An admin href with the current date range kept on it. */
  href: (path: string) => string;
}

const AdminCtx = createContext<AdminApi | null>(null);

export function useAdmin(): AdminApi {
  const api = useContext(AdminCtx);
  if (!api) throw new Error("useAdmin outside AdminShell");
  return api;
}

/**
 * Every admin page's frame, from one config (src/lib/admin-nav.ts): the page's
 * title with Find and the date range on one line, the groups as a tab row,
 * the open group's sections as small pills under it (both rows scroll
 * sideways on a phone), and the one listing view any section opens a post in.
 * `#post:<id>` on any admin page opens that listing (the listing notices'
 * links, through /admin's old-link redirect).
 */
export function AdminShell({ viewer, waiting, children }: { viewer: Viewer; waiting: number; children: ReactNode }) {
  return (
    <ListingViewProvider viewer={viewer} actions={AdminPostActions}>
      <Shell waiting={waiting}>{children}</Shell>
    </ListingViewProvider>
  );
}

function Shell({ waiting, children }: { waiting: number; children: ReactNode }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const { open } = useListingView();
  // A note that a listing is gone, shown only on the page it was asked from.
  const [missingAt, setMissingAt] = useState<{ path: string; text: string } | null>(null);
  const missing = missingAt?.path === pathname ? missingAt.text : null;
  const current = navItemFor(pathname);

  const keep = useMemo(() => {
    const q = new URLSearchParams();
    for (const k of ["range", "from", "to"]) {
      const v = params.get(k);
      if (v) q.set(k, v);
    }
    const s = q.toString();
    return s ? `?${s}` : "";
  }, [params]);
  const href = useCallback((path: string) => {
    const [base, hash] = path.split("#");
    return `${base}${keep}${hash ? `#${hash}` : ""}`;
  }, [keep]);

  const openPost = useCallback(
    async (id: number) => {
      setMissingAt(null);
      const listing = await adminLoadListing(id);
      if (listing) open(listing, "deeplink");
      else setMissingAt({ path: window.location.pathname, text: `Listing #${id} is gone.` });
    },
    [open],
  );

  // On /admin itself the old-link redirect moves #post:<id> to /admin/listings first.
  useEffect(() => {
    if (pathname === "/admin") return;
    const read = () => {
      const m = /^#post:(\d{1,9})$/.exec(window.location.hash);
      if (!m) return;
      history.replaceState(history.state, "", window.location.pathname + window.location.search);
      void openPost(Number(m[1]));
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, [openPost, pathname]);

  const api = useMemo(() => ({ openPost, href }), [openPost, href]);
  const badge = (item: AdminNavItem) => (item.id === "requests" ? waiting : 0);
  // The range is whole Eastern days, so the server's render and the browser's agree except across midnight.
  const hasRange = Boolean(current?.item.range);
  const range = useMemo(() => (hasRange ? resolveRange({ range: params.get("range") ?? undefined, from: params.get("from") ?? undefined, to: params.get("to") ?? undefined }) : null), [hasRange, params]);

  return (
    <AdminCtx.Provider value={api}>
      <div className="flex flex-col gap-4 text-sm md:gap-5">
        <PageHeader title={current?.item.label ?? "Admin"} find={<QuickJump href={href} openPost={openPost} />} range={range && <RangeControl range={range} pathname={pathname} params={new URLSearchParams(params.toString())} />} />
        <div className="-mt-1 flex flex-col gap-3">
          <GroupTabs current={current} href={href} badge={badge} caption={range && <RangeCaption range={range} />} />
          {current && current.group.items.length > 1 && <SectionPills group={current.group} current={current.item.id} href={href} badge={badge} />}
          {range && (
            <div className="md:hidden">
              <RangeCaption range={range} />
            </div>
          )}
        </div>
        {missing && (
          <p role="status" className="text-sm text-error-ink">
            {missing}
          </p>
        )}
        {children}
      </div>
    </AdminCtx.Provider>
  );
}

type NavProps = { href: (p: string) => string; badge: (item: AdminNavItem) => number };

const span = (a: string, b: string) => (a === b ? dayLabel(a) : `${dayLabel(a)} – ${dayLabel(b)}`);

/** The range in one short muted line; what "vs" means is behind its ⓘ. */
function RangeCaption({ range }: { range: ReturnType<typeof resolveRange> }) {
  const text = range.key === "all" ? "All time" : range.key === "cutover" ? `Since ${dayLabel(range.from)}` : range.prev ? `${span(range.from, range.to)} · vs ${span(range.prev.from, range.prev.to)}` : span(range.from, range.to);
  return (
    <Tip text={range.prev ? "Whole Eastern days. Every change is against the same number of days just before." : "Whole Eastern days. This range has nothing before it to compare with."} className="text-xs text-ink-3">
      {text}
    </Tip>
  );
}

/** The groups as a slim tab row: the current one underlined. A group's tab goes to its first section. */
function GroupTabs({ current, href, badge, caption }: NavProps & { current: { group: AdminNavGroup; item: AdminNavItem } | null; caption: ReactNode }) {
  return (
    <nav aria-label="Admin sections" className="-mx-4 overflow-x-auto border-b border-line px-4 md:mx-0 md:px-0">
      <div className="flex w-max items-center gap-5 md:w-auto">
        {ADMIN_NAV.map((g) => {
          const on = current?.group.id === g.id;
          return (
            <Link
              key={g.id}
              href={href(g.items[0].href)}
              aria-current={on ? (current?.item.id === g.items[0].id ? "page" : "true") : undefined}
              className={`-mb-px inline-flex h-11 items-center gap-1.5 border-b-2 text-[13px] whitespace-nowrap md:h-10 ${on ? "border-lake font-bold text-ink" : "border-transparent text-ink-3 hover:text-ink"}`}
            >
              {g.label}
              <CountBadge n={g.items.reduce((t, i) => t + badge(i), 0)} label="waiting" />
            </Link>
          );
        })}
        {caption && <span className="ml-auto hidden md:block">{caption}</span>}
      </div>
    </nav>
  );
}

/** The open group's sections as small pills, when it has more than one. */
function SectionPills({ group, current, href, badge }: NavProps & { group: AdminNavGroup; current: string }) {
  return (
    <nav aria-label={`${group.label} sections`} className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <ul className="flex w-max items-center gap-1 md:w-auto">
        {group.items.map((i) => {
          const on = i.id === current;
          return (
            <li key={i.id}>
              <Link
                href={href(i.href)}
                aria-current={on ? "page" : undefined}
                className={`inline-flex h-11 items-center gap-1.5 rounded-full px-3 text-[13px] whitespace-nowrap md:h-7 ${on ? "bg-paper font-bold text-ink shadow-[0_1px_2px_rgb(28_35_40/0.1)]" : "text-ink-2 hover:bg-line-light hover:text-ink"}`}
              >
                {i.label}
                <CountBadge n={badge(i)} label="waiting" />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
