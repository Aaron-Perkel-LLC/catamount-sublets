"use client";

import { LayoutGrid, Map as MapIcon, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { formatMoney } from "@/lib/format";
import { filterSearchParams, type ListingQuery, withQuery } from "@/lib/listing-filters";
import { AMENITY_FILTERS, AMENITY_FILTER_VALUES, OPEN_TO_FILTERS, OPEN_TO_VALUES, type AmenityFilter } from "@/lib/options";
import type { FilterBounds } from "@/server/data/listings";
import { DualRange, SingleRange } from "./RangeSlider";

export interface SemesterOption {
  code: string;
  name: string;
}

interface Props {
  mode: "browse" | "map";
  query: ListingQuery;
  bounds: FilterBounds;
  semesters: SemesterOption[];
  emptySemesters: SemesterOption[];
  /** Filters in use, for the phone's badge. */
  count: number;
  /** Results on the page, for the sheet's Apply button. */
  resultCount: number;
}

const PHONE = "(max-width: 767px)";

/**
 * The filters, shared by Browse and Map. A change rewrites the URL's query
 * (replace, not push) and lets the server re-render the board; an untouched
 * slider leaves its parameter out, so it is not a filter. On a desktop it is
 * an inline panel; on a phone a bottom sheet behind a sticky bar.
 */
export function FilterBar({ mode, query, bounds, semesters, emptySemesters, count, resultCount }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [local, setLocal] = useState<ListingQuery>(query);
  const [open, setOpen] = useState(false);
  const sheet = useRef<HTMLFormElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The URL is the truth; local state is the optimistic copy while a change
  // is in flight, re-derived whenever the server sends a new query.
  const [seen, setSeen] = useState(query);
  if (query !== seen) {
    setSeen(query);
    setLocal(query);
  }

  const apply = useCallback(
    (next: ListingQuery, immediate = false) => {
      setLocal(next);
      const run = () => {
        const p = filterSearchParams(next);
        if (mode === "browse" && next.sort !== "newest") p.set("sort", next.sort);
        const href = withQuery(pathname, p);
        if (href === withQuery(pathname, currentParams(query, mode))) return;
        startTransition(() => router.replace(href, { scroll: false }));
      };
      if (timer.current) clearTimeout(timer.current);
      if (immediate) run();
      else timer.current = setTimeout(run, 300);
    },
    [mode, pathname, query, router],
  );

  // Price and distance edits are applied on release; everything else at once.
  const [priceLow, priceHigh] = [local.minPrice ?? bounds.minPrice, local.maxPrice ?? bounds.maxPrice];
  const distance = local.maxDistance ?? bounds.maxDistance;

  const setPrice = (low: number, high: number) => {
    const any = low <= bounds.minPrice && high >= bounds.maxPrice;
    setLocal({ ...local, minPrice: any ? undefined : low, maxPrice: any ? undefined : high });
  };
  const setDistance = (v: number) => setLocal({ ...local, maxDistance: v >= bounds.maxDistance ? undefined : v });
  const commit = () => apply(local);

  const toggleAmenity = (a: AmenityFilter) =>
    apply({ ...local, amenities: local.amenities.includes(a) ? local.amenities.filter((x) => x !== a) : [...local.amenities, a] }, true);

  const active = count > 0;
  const carry = filterSearchParams(query);

  // Phone sheet: focus trap, Escape, close when the viewport widens.
  useEffect(() => {
    if (!open) return;
    const mq = window.matchMedia(PHONE);
    const onMq = () => !mq.matches && setOpen(false);
    mq.addEventListener("change", onMq);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "Tab" && sheet.current) {
        const f = sheet.current.querySelectorAll<HTMLElement>('button, select, input, a[href], [tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.classList.add("overflow-hidden", "md:overflow-auto");
    sheet.current?.querySelector<HTMLElement>("button, select, input")?.focus();
    const openerEl = opener.current;
    return () => {
      mq.removeEventListener("change", onMq);
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("overflow-hidden", "md:overflow-auto");
      openerEl?.focus();
    };
  }, [open]);

  const viewSwitch = (
    <nav className="flex rounded-lg border border-line bg-paper p-0.5 text-sm font-bold" aria-label="View listings as">
      <Link
        href={withQuery("/browse", carry)}
        aria-current={mode === "browse" ? "page" : undefined}
        className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 ${mode === "browse" ? "bg-lake text-paper" : "text-ink-2"}`}
      >
        <LayoutGrid className="h-4 w-4" aria-hidden /> List
      </Link>
      <Link
        href={withQuery("/map", carry)}
        aria-current={mode === "map" ? "page" : undefined}
        className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 ${mode === "map" ? "bg-lake text-paper" : "text-ink-2"}`}
      >
        <MapIcon className="h-4 w-4" aria-hidden /> Map
      </Link>
    </nav>
  );

  return (
    <div className="flex flex-col gap-3" data-pending={pending || undefined}>
      <div className="flex items-center justify-between gap-3 md:hidden">
        <button
          ref={opener}
          type="button"
          className="btn-secondary gap-2 py-2"
          aria-controls="filterForm"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden /> Filters
          {active && <span className="rounded-full bg-maple px-2 text-xs text-paper">{count}</span>}
        </button>
        {viewSwitch}
      </div>

      {open && <div className="fixed inset-0 z-30 bg-ink/50 md:hidden" onClick={() => setOpen(false)} aria-hidden />}

      <form
        ref={sheet}
        id="filterForm"
        role={open ? "dialog" : undefined}
        aria-modal={open ? true : undefined}
        aria-label="Filters"
        onSubmit={(e) => {
          e.preventDefault();
          apply(local, true);
          setOpen(false);
        }}
        className={`${open ? "fixed inset-x-0 bottom-0 z-40 flex max-h-[85dvh] flex-col overflow-y-auto rounded-t-2xl shadow-2xl" : "hidden"} border border-line bg-paper p-4 md:static md:flex md:max-h-none md:flex-col md:gap-4 md:rounded-xl md:shadow-none`}
      >
        <div className="mb-3 flex items-center justify-between md:hidden">
          <h2 className="text-lg font-bold">Filters</h2>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close filters" className="rounded-lg p-1.5 hover:bg-line-light">
            <X aria-hidden />
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <DualRange
            label="Price per month"
            min={bounds.minPrice}
            max={bounds.maxPrice}
            step={50}
            low={priceLow}
            high={priceHigh}
            format={formatMoney}
            anyLabel="Any price"
            onChange={setPrice}
            onCommit={commit}
          />
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-bold">Semester</span>
            <select className="field" value={local.semester ?? ""} onChange={(e) => apply({ ...local, semester: e.target.value || undefined }, true)}>
              <option value="">All semesters</option>
              {semesters.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
              {emptySemesters.map((s) => (
                <option key={s.code} value={s.code} disabled>
                  {s.name} (none yet)
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-bold">Roommate preference</span>
            <select
              className="field"
              value={local.openTo ?? ""}
              onChange={(e) => apply({ ...local, openTo: (OPEN_TO_VALUES as readonly string[]).includes(e.target.value) ? (e.target.value as ListingQuery["openTo"]) : undefined }, true)}
            >
              <option value="">Show all</option>
              {OPEN_TO_VALUES.map((k) => (
                <option key={k} value={k}>
                  {OPEN_TO_FILTERS[k].label}
                </option>
              ))}
            </select>
          </label>
          <SingleRange
            label="Distance from campus"
            min={0.25}
            max={bounds.maxDistance}
            step={0.25}
            value={distance}
            format={(n) => `Within ${n} mi`}
            anyLabel="Any distance"
            onChange={setDistance}
            onCommit={commit}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 md:mt-0" role="group" aria-label="Must have">
          <span className="text-sm font-bold">Must have</span>
          {AMENITY_FILTER_VALUES.map((a) => {
            const on = local.amenities.includes(a);
            return (
              <button
                key={a}
                type="button"
                aria-pressed={on}
                onClick={() => toggleAmenity(a)}
                className={`rounded-full border px-3 py-1 text-sm ${on ? "border-lake bg-lake text-paper" : "border-line bg-paper text-ink-2 hover:border-lake"}`}
              >
                {AMENITY_FILTERS[a].label}
              </button>
            );
          })}
          <button
            type="button"
            aria-pressed={local.negotiable}
            onClick={() => apply({ ...local, negotiable: !local.negotiable }, true)}
            className={`rounded-full border px-3 py-1 text-sm ${local.negotiable ? "border-lake bg-lake text-paper" : "border-line bg-paper text-ink-2 hover:border-lake"}`}
          >
            Price negotiable
          </button>
          {active && (
            <Link href={pathname} className="link text-sm" onClick={() => setOpen(false)}>
              Clear filters
            </Link>
          )}
        </div>

        <div className="mt-4 md:hidden">
          <button type="submit" className="btn-primary w-full">
            {mode === "map" ? "Show on map" : resultCount === 0 ? "No matches yet" : `Show ${resultCount} sublet${resultCount === 1 ? "" : "s"}`}
          </button>
        </div>
      </form>
      {/* No List/Map switch on a desktop: the bar's Browse and Map links carry the filters the same way. */}
    </div>
  );
}

function currentParams(query: ListingQuery, mode: "browse" | "map"): URLSearchParams {
  const p = filterSearchParams(query);
  if (mode === "browse" && query.sort !== "newest") p.set("sort", query.sort);
  return p;
}
