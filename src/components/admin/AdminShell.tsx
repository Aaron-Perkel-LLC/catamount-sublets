"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ListingViewProvider, useListingView, type Viewer } from "@/components/listings/listing-view";
import { ADMIN_NAV, type AdminNavGroup, type AdminNavItem, navItemFor } from "@/lib/admin-nav";
import { adminLoadListing } from "@/server/actions/admin";
import { AdminPostActions } from "./AdminPostActions";
import { QuickJump } from "./QuickJump";

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

const COLLAPSED_KEY = "admin-nav-collapsed";
const COLLAPSED_EVENT = "admin-nav-collapsed";

/** The folded sidebar groups, kept in this browser only (and none folded where storage is unavailable). */
const collapsedStore = {
  subscribe(cb: () => void) {
    window.addEventListener(COLLAPSED_EVENT, cb);
    window.addEventListener("storage", cb);
    return () => {
      window.removeEventListener(COLLAPSED_EVENT, cb);
      window.removeEventListener("storage", cb);
    };
  },
  read(): string {
    try {
      return localStorage.getItem(COLLAPSED_KEY) ?? "[]";
    } catch {
      return "[]";
    }
  },
  write(ids: string[]) {
    try {
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify(ids));
    } catch {
      /* not remembered */
    }
    window.dispatchEvent(new Event(COLLAPSED_EVENT));
  },
};

function parseCollapsed(raw: string): Set<string> {
  try {
    const v = JSON.parse(raw) as unknown;
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

/**
 * Every admin page's frame: the sections grouped (one config, src/lib/admin-nav.ts),
 * as a sidebar on a desktop and a group-then-section picker on a phone, the
 * quick-jump box, and the one listing view any section opens a post in.
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
  const badge = (item: AdminNavItem) => (item.id === "requests" && waiting > 0 ? waiting : null);

  return (
    <AdminCtx.Provider value={api}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">Admin</h1>
          <QuickJump href={href} openPost={openPost} />
        </div>
        <PhoneNav current={current} href={href} badge={badge} />
        <div className="flex flex-col gap-4 md:grid md:grid-cols-[12rem_minmax(0,1fr)] md:items-start md:gap-8">
          <SideNav current={current?.item.id ?? null} href={href} badge={badge} />
          <div className="flex min-w-0 flex-col gap-4">
            {current && (
              <h2 className="sr-only text-xl font-bold md:not-sr-only">
                {current.group.items.length > 1 || current.group.label !== current.item.label ? current.item.label : current.group.label}
              </h2>
            )}
            {missing && (
              <p role="status" className="text-sm text-error-ink">
                {missing}
              </p>
            )}
            {children}
          </div>
        </div>
      </div>
    </AdminCtx.Provider>
  );
}

type NavProps = { href: (p: string) => string; badge: (item: AdminNavItem) => number | null };

function Badge({ n }: { n: number | null }) {
  return n ? (
    <span className="ml-1.5 rounded-full bg-maple px-1.5 text-xs text-paper" aria-label={`${n} waiting`}>
      {n}
    </span>
  ) : null;
}

/** Desktop: the groups down the side, each one foldable (remembered in this browser only). */
function SideNav({ current, href, badge }: NavProps & { current: string | null }) {
  const raw = useSyncExternalStore(collapsedStore.subscribe, collapsedStore.read, () => "[]");
  const collapsed = useMemo(() => parseCollapsed(raw), [raw]);
  const toggle = (id: string) => {
    const next = new Set(collapsed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    collapsedStore.write([...next]);
  };

  const link = (item: AdminNavItem, label = item.label) => (
    <Link
      href={href(item.href)}
      aria-current={current === item.id ? "page" : undefined}
      className={`flex w-full items-center rounded-lg border-l-4 px-3 py-2 text-left text-sm font-bold ${current === item.id ? "border-maple bg-notice-tint text-lake" : "border-transparent text-ink-2 hover:bg-line-light hover:text-lake"}`}
    >
      {label}
      <Badge n={badge(item)} />
    </Link>
  );

  return (
    <nav aria-label="Admin sections" className="hidden md:sticky md:top-4 md:block">
      <ul className="flex flex-col gap-1">
        {ADMIN_NAV.map((g) =>
          g.items.length === 1 ? (
            <li key={g.id}>{link(g.items[0], g.label)}</li>
          ) : (
            <li key={g.id} className="flex flex-col">
              <button
                type="button"
                aria-expanded={!collapsed.has(g.id) || g.items.some((i) => i.id === current)}
                onClick={() => toggle(g.id)}
                className="flex items-center justify-between rounded-lg px-3 pt-2 pb-1 text-xs font-bold tracking-wide text-ink-3 uppercase hover:text-lake"
              >
                {g.label}
                {g.items.some((i) => badge(i)) && collapsed.has(g.id) && <Badge n={g.items.reduce((t, i) => t + (badge(i) ?? 0), 0)} />}
                <ChevronDown className={`ml-auto h-3.5 w-3.5 transition-transform ${collapsed.has(g.id) && !g.items.some((i) => i.id === current) ? "-rotate-90" : ""}`} aria-hidden />
              </button>
              {(!collapsed.has(g.id) || g.items.some((i) => i.id === current)) && (
                <ul className="flex flex-col gap-0.5">
                  {g.items.map((i) => (
                    <li key={i.id}>{link(i)}</li>
                  ))}
                </ul>
              )}
            </li>
          ),
        )}
      </ul>
    </nav>
  );
}

/** Phone: the groups as a row of pills, then the open group's sections; every target at least 40 px tall. */
function PhoneNav({ current, href, badge }: NavProps & { current: { group: AdminNavGroup; item: AdminNavItem } | null }) {
  // The group picked here, until the page changes; then the current page's group.
  const [picked, setPicked] = useState<{ on: string | undefined; id: string } | null>(null);
  const groupId = picked && picked.on === current?.item.id ? picked.id : (current?.group.id ?? ADMIN_NAV[0].id);
  const setGroupId = (id: string) => setPicked({ on: current?.item.id, id });
  const group = ADMIN_NAV.find((g) => g.id === groupId) ?? ADMIN_NAV[0];
  const pill = (on: boolean) => `inline-flex min-h-10 items-center rounded-full border px-3.5 text-sm font-bold whitespace-nowrap ${on ? "border-lake bg-lake text-paper" : "border-line bg-paper text-ink-2"}`;

  return (
    <nav aria-label="Admin sections" className="flex flex-col gap-2 md:hidden">
      <div className="-mx-4 overflow-x-auto px-4">
        <ul className="flex w-max gap-1.5">
          {ADMIN_NAV.map((g) => (
            <li key={g.id}>
              {g.items.length === 1 ? (
                <Link href={href(g.items[0].href)} aria-current={current?.group.id === g.id ? "page" : undefined} className={pill(current?.group.id === g.id)}>
                  {g.label}
                </Link>
              ) : (
                <button type="button" aria-expanded={groupId === g.id} onClick={() => setGroupId(g.id)} className={pill(groupId === g.id)}>
                  {g.label}
                  <Badge n={g.items.reduce((t, i) => t + (badge(i) ?? 0), 0) || null} />
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
      {group.items.length > 1 && (
        <div className="-mx-4 overflow-x-auto px-4">
          <ul className="flex w-max gap-1.5 border-b border-line pb-2">
            {group.items.map((i) => {
              const on = current?.item.id === i.id;
              return (
                <li key={i.id}>
                  <Link
                    href={href(i.href)}
                    aria-current={on ? "page" : undefined}
                    className={`inline-flex min-h-10 items-center rounded-lg px-3 text-sm whitespace-nowrap ${on ? "bg-notice-tint font-bold text-lake" : "text-ink-2"}`}
                  >
                    {i.label}
                    <Badge n={badge(i)} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </nav>
  );
}
