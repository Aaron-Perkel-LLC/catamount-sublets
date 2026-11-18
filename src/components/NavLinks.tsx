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
export function useNavItems({
  isAdmin,
  hasListing,
  canPost = true,
  withAccount = false,
}: {
  isAdmin: boolean;
  hasListing: boolean;
  /** False for a community account: no New Post link (the page would only explain why). */
  canPost?: boolean;
  withAccount?: boolean;
}): NavItem[] {
  const pathname = usePathname();
  const params = useSearchParams();
  const onBoard = pathname === "/browse" || pathname === "/map";
  const carry = onBoard ? filterSearchParams(parseListingQuery(Object.fromEntries(params.entries()))) : new URLSearchParams();
  const item = (href: string, label: string): NavItem => ({ href, label, current: isCurrent(pathname, href) });
  return [
    item(withQuery("/browse", carry), "Browse"),
    item(withQuery("/map", carry), "Map"),
    ...(canPost || hasListing ? [item("/post", hasListing ? "My Post" : "New Post")] : []),
    ...(withAccount ? [item("/account", "Account")] : []),
    ...(isAdmin ? [item("/admin", "Admin")] : []),
  ];
}

/** A desktop bar link: the current page in lake with a maple bar on the header's edge. */
const barLink = (current: boolean) =>
  `relative flex items-center px-2.5 hover:text-lake ${
    current ? "text-lake after:absolute after:inset-x-2.5 after:bottom-0 after:h-[3px] after:rounded-t-full after:bg-maple" : ""
  }`;

/** The desktop bar (769 px and up, the legacy breakpoint). */
export function NavLinks({ isAdmin, hasListing, canPost = true }: { isAdmin: boolean; hasListing: boolean; canPost?: boolean }) {
  const items = useNavItems({ isAdmin, hasListing, canPost });
  return (
    <div className="hidden self-stretch text-sm font-bold text-ink-2 md:flex">
      {items.map((i) => (
        <Link key={i.label} href={i.href} aria-current={i.current ? "page" : undefined} className={barLink(i.current)}>
          {i.label}
        </Link>
      ))}
    </div>
  );
}

/** Account in the desktop bar's right-hand group, marked current like the links on the left. */
export function AccountLink() {
  const current = isCurrent(usePathname(), "/account");
  return (
    <Link href="/account" aria-current={current ? "page" : undefined} className={`shrink-0 self-stretch font-bold text-ink-2 ${barLink(current)}`}>
      Account
    </Link>
  );
}
