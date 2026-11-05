"use client";

import { X } from "lucide-react";
import { useState } from "react";
import type { Announcement } from "@/server/data/settings";

/** The site-wide banner. Dismissing it hides it until the next page load, as before. */
export function AnnouncementBanner({ announcement }: { announcement: Announcement }) {
  const [hidden, setHidden] = useState(false);
  if (!announcement.active || !announcement.message || hidden) return null;
  const tone = { info: "border-notice-line bg-notice-tint text-notice-ink", warning: "border-tenant-line bg-tenant-tint text-tenant-ink", success: "border-included-line bg-included-tint text-included-ink" }[announcement.style];
  return (
    <div className={`border-b ${tone}`} role="status">
      <div className="mx-auto flex w-full max-w-6xl items-start gap-3 px-4 py-2.5 text-sm">
        <p className="flex-1 whitespace-pre-line">{linkify(announcement.message)}</p>
        <button type="button" onClick={() => setHidden(true)} aria-label="Dismiss" className="rounded p-1 hover:bg-paper/50">
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

/** http(s) URLs become links; everything else is plain text. */
export function linkify(text: string) {
  const parts = text.split(/(https?:\/\/[^\s<>"]+)/g);
  return parts.map((p, i) =>
    /^https?:\/\//.test(p) ? (
      <a key={i} href={p} className="font-bold underline" target="_blank" rel="noopener">
        {p}
      </a>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}
