"use client";

import { CircleCheck, Info, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Right after the first Post, at the top of My post: whether the listing is
 * live, and if not, the one thing missing. Focus moves here so a screen
 * reader hears it; dismissing drops ?posted from the address.
 */
export function PostedBanner({ live, missing }: { live: boolean; missing: string | null }) {
  const router = useRouter();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus({ preventScroll: true }), []);
  const Icon = live ? CircleCheck : Info;
  return (
    <section
      role="status"
      className={`flex items-start gap-3 rounded-xl border p-4 ${live ? "border-included-line bg-included-tint text-included-ink" : "border-tenant-line bg-tenant-tint text-tenant-ink"}`}
    >
      <Icon className="mt-0.5 h-6 w-6 shrink-0" aria-hidden />
      <div className="flex flex-1 flex-col gap-1">
        <h2 ref={heading} tabIndex={-1} className="text-lg font-bold outline-none">
          {live ? "Your listing is live" : "Your listing is saved"}
        </h2>
        <p className="text-sm">{live ? "People can find it on Browse and the Map now. Share it below to get it seen sooner." : missing}</p>
      </div>
      <button type="button" className="rounded-lg p-1 hover:bg-paper/60" aria-label="Dismiss" onClick={() => router.replace("/post", { scroll: false })}>
        <X className="h-5 w-5" aria-hidden />
      </button>
    </section>
  );
}
