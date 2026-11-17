"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useNavItems } from "./NavLinks";

/** Browse and Map (carrying the filters, as for a signed-in person) and a Sign in that returns here. */
export function PublicNav() {
  const items = useNavItems({ isAdmin: false, hasListing: false }).filter((i) => i.label === "Browse" || i.label === "Map");
  const pathname = usePathname();
  const params = useSearchParams();
  const here = params.size > 0 ? `${pathname}?${params.toString()}` : pathname;
  return (
    <>
      <div className="flex self-stretch text-sm font-bold text-ink-2">
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
      <Link href={`/sign-in?next=${encodeURIComponent(here)}`} className="btn-primary ml-auto px-3 py-2 text-sm">
        Sign in
      </Link>
    </>
  );
}
