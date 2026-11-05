"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { preconnect } from "react-dom";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { LIMITS } from "@/config/site";
import { amenityField, formToListingInput, utilityField, validateListingInput } from "@/lib/listing-input";
import {
  AMENITY_KEYS,
  amenityFormLabel,
  ROOMMATE_GENDER_OPTIONS,
  ROOMMATE_GENDER_VALUES,
  ROOMMATE_PREFERENCE_OPTIONS,
  ROOMMATE_PREFERENCE_VALUES,
  UTILITY_KINDS,
  UTILITY_OPTIONS,
  UTILITY_VALUES,
} from "@/lib/options";
import { saveListing, type SaveState } from "@/server/actions/post";
import { loadMapStyle } from "../map/basemap";
import { focusFirstInvalid } from "../form-errors";
import type { MyListing } from "@/server/data/my-listing";
import { AddressCombobox, type AddressState } from "./AddressCombobox";
import { SemesterPicker, type SemesterPill } from "./SemesterPicker";

const PostMap = dynamic(() => import("./PostMap"), { ssr: false, loading: () => <div className="h-72 rounded-xl border border-line bg-line-light" /> });

const UTILITY_LABEL: Record<(typeof UTILITY_KINDS)[number], string> = { electric: "Electric", gas: "Gas", water: "Water", internet: "Internet" };

/**
 * The listing form. Three fields are named like search boxes (search_place,
 * search_reach, search_text) because Safari ignores
 * autocomplete="off" for contact details and would offer the Contacts bar;
 * the action maps them back (FORM_ALIASES).
 */
export function PostForm({
  listing,
  semesterOptions,
  accountEmail,
  onCreated,
  photosReady = 0,
}: {
  listing: MyListing | null;
  semesterOptions: SemesterPill[];
  accountEmail: string;
  /** After the first save: upload the photos picked so far; resolves with how many were added. */
  onCreated?: (listingId: number) => Promise<number>;
  /** On a new post: how many photos are picked and will go up with it. */
  photosReady?: number;
}) {
  const router = useRouter();
  const r = listing?.row;
  const [addingPhotos, setAddingPhotos] = useState(false);
  const [state, action, pending] = useActionState<SaveState, FormData>(async (prev, formData) => {
    const result = await saveListing(prev, formData);
    if (!result.ok) return result;
    if (!result.created || !result.listingId) {
      // A later save: the "just posted" banner has said its piece.
      if (window.location.search.includes("posted")) router.replace("/post", { scroll: false });
      return result;
    }
    // A new listing: the photos picked above upload now, then the page goes back to the top and
    // re-renders as "My post" with the banner saying whether it is live (PostedBanner).
    setAddingPhotos(true);
    if (onCreated) await onCreated(result.listingId);
    setAddingPhotos(false);
    router.replace("/post?posted=1");
    return { ...result, message: undefined };
  }, { ok: false });
  const [address, setAddress] = useState<AddressState>({
    text: r?.address ?? "",
    lat: r?.lat ?? null,
    lon: r?.lon ?? null,
    mode: r ? "pinned" : "none",
  });
  const [roommates, setRoommates] = useState<string>(r?.roommates?.toString() ?? "");

  // The map's chunk is the slow part; its style and first tiles can start now.
  preconnect("https://tiles.openfreemap.org");
  useEffect(() => {
    loadMapStyle().catch(() => {});
  }, []);

  // A refusal found in the browser (same schema as the server), shown until the next submit.
  const [refused, setRefused] = useState<{ error: string; fieldErrors: Record<string, string> } | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const err = (refused ?? state).fieldErrors ?? {};
  const topError = refused ? refused.error : state.error;

  // Either kind of refusal takes the person to the first field that needs them (each effect fires only on a new one).
  useEffect(() => {
    if (state.error) focusFirstInvalid(form.current);
  }, [state]);
  useEffect(() => {
    if (refused) focusFirstInvalid(form.current);
  }, [refused]);

  const isEdit = Boolean(listing);

  return (
    <form
      ref={form}
      autoComplete="off"
      className="flex flex-col gap-6"
      noValidate
      // Checked here with the server's schema, then dispatched by hand rather than as the form's
      // action: React resets a form after its action, which emptied every field on an error.
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        const check = validateListingInput(formToListingInput(data));
        if (!check.ok) {
          setRefused({ error: "Check the fields marked below.", fieldErrors: check.fieldErrors });
          return;
        }
        setRefused(null);
        startTransition(() => action(data));
      }}
    >
      {topError && (
        <p role="alert" className="rounded-lg border border-error-line bg-error-tint px-3 py-2 text-sm text-error-ink">
          {topError}
        </p>
      )}
      {state.ok && state.message && (
        <p role="status" className="rounded-lg border border-included-line bg-included-tint px-3 py-2 text-sm text-included-ink">
          {state.message}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-bold">
            Price per month <span className="font-normal text-ink-3">(rent only, not including utilities)</span>
          </span>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3">$</span>
            {/* step="any": Safari's own "enter a valid value" never fires; the server says "whole dollars" instead. */}
            <input name="price" aria-invalid={err.price ? true : undefined} type="number" inputMode="numeric" min={0} max={LIMITS.priceMax} step="any" required className="field pl-7" defaultValue={r?.price ?? ""} />
          </div>
          {err.price && <span className="text-sm text-error-ink">{err.price}</span>}
        </label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" name="priceNegotiable" defaultChecked={r?.priceNegotiable ?? false} className="h-4 w-4" />
          Price is negotiable
        </label>
      </div>

      <AddressCombobox state={address} onChange={setAddress} error={err.address} />
      <PostMap lat={address.lat} lon={address.lon} onPin={(lat, lon) => setAddress((a) => ({ ...a, lat, lon, mode: "pinned" }))} />

      <SemesterPicker options={semesterOptions} initial={listing?.semesters.map((s) => s.code) ?? []} error={err.semesters} />

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-0.5 text-base font-bold">The place and roommates</legend>
        <p className="text-sm text-ink-2">Optional, but the facts people filter on.</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-bold">Bedrooms</span>
            <input name="bedrooms" aria-invalid={err.bedrooms ? true : undefined} type="number" min={0} max={20} step={1} placeholder="e.g. 3" className="field" defaultValue={r?.bedrooms ?? ""} />
            {err.bedrooms && <span className="text-error-ink">{err.bedrooms}</span>}
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-bold">Bathrooms</span>
            <input name="bathrooms" aria-invalid={err.bathrooms ? true : undefined} type="number" min={0.5} max={9.5} step={0.5} placeholder="e.g. 1.5" className="field" defaultValue={r?.bathrooms ?? ""} />
            {err.bathrooms && <span className="text-error-ink">{err.bathrooms}</span>}
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-bold">Roommates staying</span>
            <input name="roommates" aria-invalid={err.roommates ? true : undefined} type="number" min={0} max={20} step={1} placeholder="e.g. 2" className="field" value={roommates} onChange={(e) => setRoommates(e.target.value)} />
            {err.roommates && <span className="text-error-ink">{err.roommates}</span>}
          </label>
        </div>
        {roommates !== "0" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-bold">Who lives here now</span>
              <select name="roommateGender" className="field" defaultValue={r?.roommateGender ?? ""}>
                {ROOMMATE_GENDER_VALUES.map((v) => (
                  <option key={v} value={v}>
                    {ROOMMATE_GENDER_OPTIONS[v]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-bold">Hoping to sublet to</span>
              <select name="roommatePreference" className="field" defaultValue={r?.roommatePreference ?? ""}>
                {ROOMMATE_PREFERENCE_VALUES.map((v) => (
                  <option key={v} value={v}>
                    {ROOMMATE_PREFERENCE_OPTIONS[v]}
                  </option>
                ))}
              </select>
              <span className="text-xs text-ink-3">A preference, not a requirement. It shows on your card and lets people filter.</span>
            </label>
          </div>
        )}
      </fieldset>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-bold">Description</span>
        <textarea
          name="description"
          aria-invalid={err.description ? true : undefined}
          rows={6}
          maxLength={LIMITS.descriptionMaxChars}
          className="field"
          placeholder="Describe your place — the room, the roommates, parking, what's nearby."
          defaultValue={r?.description ?? ""}
        />
        {err.description && <span className="text-sm text-error-ink">{err.description}</span>}
      </label>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-base font-bold">Utilities and amenities</legend>
        <div className="grid gap-4 sm:grid-cols-4">
          {UTILITY_KINDS.map((k) => (
            <label key={k} className="flex flex-col gap-1.5 text-sm">
              <span className="font-bold">{UTILITY_LABEL[k]}</span>
              <select name={utilityField(k)} className="field" defaultValue={r?.[utilityField(k)] ?? ""}>
                {UTILITY_VALUES.map((v) => (
                  <option key={v} value={v}>
                    {UTILITY_OPTIONS[v]}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <label className="flex flex-col gap-1.5 text-sm sm:max-w-xs">
          <span className="font-bold">
            Estimated monthly utilities <span className="font-normal text-ink-3">(what the tenant pays)</span>
          </span>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3">$</span>
            <input name="utilityCost" aria-invalid={err.utilityCost ? true : undefined} type="number" inputMode="numeric" min={0} step="any" placeholder="e.g. 150" className="field pl-7" defaultValue={r?.utilityCost ?? ""} />
          </div>
          {err.utilityCost && <span className="text-error-ink">{err.utilityCost}</span>}
        </label>
        <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-4">
          {AMENITY_KEYS.map((k) => (
            <label key={k} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name={amenityField(k)} defaultChecked={r?.[amenityField(k)] ?? false} className="h-4 w-4" />
              {amenityFormLabel(k)}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-0.5 text-base font-bold">How to reach you</legend>
        <p className="text-sm text-ink-2">
          Your listing shows the name on your account. Change it on the{" "}
          <Link href="/account" className="link">
            Account page
          </Link>
          .
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-bold">Contact email</span>
            <input name="search_reach" aria-invalid={err.contactEmail ? true : undefined} type="text" inputMode="email" className="field" placeholder={accountEmail} defaultValue={r?.contactEmail ?? accountEmail} />
            <span className="text-xs text-ink-3">Signed-in students can email you here. Blank means your account email.</span>
            {err.contactEmail && <span className="text-error-ink">{err.contactEmail}</span>}
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-bold">
              Phone number <span className="font-normal text-ink-3">(optional)</span>
            </span>
            <input name="search_text" aria-invalid={err.contactPhone ? true : undefined} type="text" inputMode="tel" maxLength={20} className="field" placeholder="(802) 555-1234" defaultValue={r?.contactPhone ?? ""} />
            {err.contactPhone && <span className="text-error-ink">{err.contactPhone}</span>}
          </label>
        </div>
      </fieldset>

      <p className="text-xs text-ink-3">
        Your address, description and contact details are shown to signed-in students only. Shared links and previews show the
        price, semester, size and distance from campus, nothing else.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn-primary px-6 py-3" aria-busy={pending} aria-disabled={pending}>
          {addingPhotos ? "Adding photos…" : pending ? (isEdit ? "Saving…" : "Posting…") : isEdit ? "Save changes" : "Post"}
        </button>
        {/* The photos are a long way up by now: say whether they come along. */}
        {!isEdit && (
          <p className="text-sm text-ink-2">
            {photosReady > 0 ? (
              <>
                {photosReady} photo{photosReady === 1 ? "" : "s"} go up with it.{" "}
                <a href="#photos" className="link">
                  Check them
                </a>
              </>
            ) : (
              <>
                No photos yet; it goes on the board once it has one.{" "}
                <a href="#photos" className="link">
                  Add photos
                </a>
              </>
            )}
          </p>
        )}
      </div>
    </form>
  );
}
