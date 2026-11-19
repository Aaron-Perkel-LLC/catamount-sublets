"use client";

import { Info } from "lucide-react";
import { type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from "react";

/**
 * A label with its explanation behind a small ⓘ: shown on hover and on
 * keyboard focus, toggled by a tap (the ⓘ's hit area is 44 px). The bubble
 * is nudged sideways so it never leaves the screen. `quiet` (dense lists)
 * keeps the ⓘ out of sight until the label is pointed at, where there is a
 * pointer to point with; on a touch screen it always shows.
 */
export function Tip({ text, children, className = "", quiet = false }: { text: string; children: ReactNode; className?: string; quiet?: boolean }) {
  const id = useId();
  const wrap = useRef<HTMLSpanElement>(null);
  const bubble = useRef<HTMLSpanElement>(null);
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [shift, setShift] = useState(0);
  const open = hover || pinned;

  useEffect(() => {
    if (!pinned) return;
    const away = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setPinned(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPinned(false);
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [pinned]);

  useLayoutEffect(() => {
    if (!open || !bubble.current) return;
    const r = bubble.current.getBoundingClientRect();
    const edge = 12;
    const natural = r.left - shift;
    const over = natural + r.width - (document.documentElement.clientWidth - edge);
    const next = over > 0 ? -over : natural < edge ? edge - natural : 0;
    if (next !== shift) setShift(next);
  }, [open, shift]);

  return (
    <span
      ref={wrap}
      className={`group/tip relative inline-flex items-center gap-1 ${quiet ? "[@media(hover:hover)]:cursor-help" : ""} ${className}`}
      onPointerEnter={(e) => e.pointerType === "mouse" && setHover(true)}
      onPointerLeave={() => setHover(false)}
    >
      {children}
      <button
        type="button"
        aria-label="What this counts"
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onClick={() => setPinned((p) => !p)}
        onFocus={(e) => e.currentTarget.matches(":focus-visible") && setHover(true)}
        onBlur={() => setHover(false)}
        className={`relative grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full text-ink-3/60 before:absolute before:-inset-4 hover:text-lake ${quiet && !open ? "group-hover/tip:opacity-100 focus-visible:opacity-100 [@media(hover:hover)]:opacity-0" : ""}`}
      >
        <Info className="h-3.5 w-3.5" aria-hidden />
      </button>
      {open && (
        <span
          ref={bubble}
          id={id}
          role="tooltip"
          style={{ left: shift }}
          className="absolute top-full z-30 mt-2 w-60 max-w-[calc(100vw-1.5rem)] rounded-lg bg-ink px-3 py-2 text-left text-xs leading-relaxed font-normal tracking-normal whitespace-normal text-paper normal-case shadow-lg"
        >
          {text}
        </span>
      )}
    </span>
  );
}
