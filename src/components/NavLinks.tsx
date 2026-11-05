"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { filterSearchParams, parseListingQuery, withQuery } from "@/lib/listing-filters";
import { isCurrent } from "@/lib/nav";

export interface NavItem {
  href: string;
  label: string;
  current: boolean;
}

/**
 * The site's links, with Browse and Map carrying the current filters across
 * so switching view keeps what the person was looking at. Used by the
 * desktop bar (NavLinks) and the phone menu (MobileNav), so both agree.
 */
export function useNavItems({ isAdmin, hasListing, withAccount = false }: { isAdmin: boolean; hasListing: boolean; withAccount?: boolean }): NavItem[] {
  const pathname = usePathname();
  const params = useSearchParams();
  const onBoard = pathname === "/browse" || pathname === "/map";
  const carry = onBoard ? filterSearchParams(parseListingQuery(Object.fromEntries(params.entries()))) : new URLSearchParams();
  const item = (href: string, label: string): NavItem => ({ href, label, current: isCurrent(pathname, href) });
  return [
    item(withQuery("/browse", carry), "Browse"),
    item(withQuery("/map", carry), "Map"),
    item("/post", hasListing ? "My Post" : "New Post"),
    ...(withAccount ? [item("/account", "Account")] : []),
    ...(isAdmin ? [item("/admin", "Admin")] : []),
  ];
}

/** The desktop bar (769 px and up, the legacy breakpoint): the current page in lake with a maple bar on the header's edge. */
export function NavLinks({ isAdmin, hasListing }: { isAdmin: boolean; hasListing: boolean }) {
  const items = useNavItems({ isAdmin, hasListing });
  return (
    <div className="hidden self-stretch text-sm font-bold text-ink-2 md:flex">
      {items.map((i) => (
        <Link
          key={i.label}
          href={i.href}
          aria-current={i.current ? "page" : undefined}
          className={`relative flex items-center px-2.5 hover:text-lake ${
            i.current ? "text-lake after:absolute after:inset-x-2.5 after:bottom-0 after:h-[3px] after:rounded-t-full after:bg-maple" : ""
          }`}
        >
          {i.label}
        </Link>
      ))}
    </div>
  );
}

/** The person's name in the desktop bar, linking to their account and marked current there. */
export function AccountLink({ label }: { label: string }) {
  const current = isCurrent(usePathname(), "/account");
  return (
    <Link href="/account" aria-current={current ? "page" : undefined} className={`hover:text-lake ${current ? "font-bold text-lake" : "text-ink-2"}`}>
      {label}
    </Link>
  );
}
