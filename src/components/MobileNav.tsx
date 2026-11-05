"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { isCurrent } from "@/lib/nav";
import { useNavItems } from "./NavLinks";

/**
 * The phone header (up to 768 px, as the old site): the person's first name
 * and a menu button in the bar, and the links in a panel that drops down
 * under it. The panel is a dialog in all but name: the button says whether
 * it is open, focus starts inside it and cycles within it, Escape, the
 * backdrop and any navigation close it, and focus returns to the button.
 */
export function MobileNav({ isAdmin, hasListing, name, signOut }: { isAdmin: boolean; hasListing: boolean; name: string; signOut: () => Promise<void> }) {
  const items = useNavItems({ isAdmin, hasListing, withAccount: true });
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();

  // Navigation closes it (state adjusted during render, the React way); so does growing past the breakpoint.
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    setOpen(false);
  }
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 769px)");
    const onChange = () => mq.matches && setOpen(false);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!open) return;
    const el = panel.current;
    const focusable = () => [...(el?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ?? [])];
    focusable()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        button.current?.focus();
        return;
      }
      if (e.key !== "Tab") return;
      const f = focusable();
      if (f.length === 0) return;
      const i = f.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && i <= 0) {
        e.preventDefault();
        f[f.length - 1].focus();
      } else if (!e.shiftKey && i === f.length - 1) {
        e.preventDefault();
        f[0].focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const close = () => {
    setOpen(false);
    button.current?.focus();
  };

  return (
    <div className="ml-auto flex min-w-0 items-center gap-1 md:hidden">
      <Link
        href="/account"
        aria-current={isCurrent(pathname, "/account") ? "page" : undefined}
        className={`max-w-[9rem] truncate text-sm hover:text-lake ${isCurrent(pathname, "/account") ? "font-bold text-lake" : "text-ink-2"}`}
        title={name}
      >
        {name}
      </Link>
      <button
        ref={button}
        type="button"
        className="icon-btn"
        aria-label={open ? "Close menu" : "Menu"}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => (open ? close() : setOpen(true))}
      >
        {open ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
      </button>
      {open && <div className="fixed inset-0 top-16 z-30 bg-ink/40" onClick={close} aria-hidden />}
      <div
        ref={panel}
        id={id}
        hidden={!open}
        className="absolute inset-x-0 top-16 z-40 border-b border-line bg-paper px-4 pt-2 pb-4 shadow-lg"
      >
        <ul className="flex flex-col">
          {items.map((i) => (
            <li key={i.label}>
              <Link
                href={i.href}
                aria-current={i.current ? "page" : undefined}
                className={`flex items-center justify-between rounded-lg border-l-4 px-3 py-3 text-base font-bold ${
                  i.current ? "border-maple bg-notice-tint text-lake" : "border-transparent text-ink-2"
                }`}
              >
                {i.label}
                {i.current && <span className="text-xs font-normal text-ink-3">You&apos;re here</span>}
              </Link>
            </li>
          ))}
          <li className="mt-1 border-t border-line pt-2">
            <form action={signOut}>
              <button type="submit" className="block w-full rounded-lg border-l-4 border-transparent px-3 py-3 text-left text-base text-ink-2">
                Sign out
              </button>
            </form>
          </li>
        </ul>
      </div>
    </div>
  );
}
