"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { LISTING_SORTS, LISTING_SORT_VALUES, type ListingSort } from "@/lib/options";

/** "12 Spring 2027 sublets match these filters" and the sort select. */
export function SortBar({ count, semesterName, filtered, sort }: { count: number; semesterName?: string; filtered: boolean; sort: ListingSort }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const heading = `${count} ${semesterName ? `${semesterName} ` : ""}sublet${count === 1 ? "" : "s"}${filtered ? " match these filters" : ""}`;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-xl font-bold">{heading}</h1>
      <label className="flex items-center gap-2 text-sm">
        <span className="text-ink-2">Sort</span>
        <select
          className="field w-auto py-1.5"
          value={sort}
          onChange={(e) => {
            const p = new URLSearchParams(params.toString());
            p.delete("id");
            p.delete("via");
            if (e.target.value === "newest") p.delete("sort");
            else p.set("sort", e.target.value);
            const s = p.toString();
            startTransition(() => router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false }));
          }}
        >
          {LISTING_SORT_VALUES.map((k) => (
            <option key={k} value={k}>
              {LISTING_SORTS[k]}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
