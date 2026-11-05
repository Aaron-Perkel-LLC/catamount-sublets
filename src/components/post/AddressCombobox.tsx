"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { GeocodeHit } from "@/app/api/geocode/route";

export type AddressMode = "none" | "picked" | "pinned";

export interface AddressState {
  text: string;
  lat: number | null;
  lon: number | null;
  mode: AddressMode;
}

/**
 * The address field: an ARIA combobox over the geocoder. A picked suggestion
 * stays valid only while its text is unchanged; a pin placed on the map
 * stays valid whatever the text says, since the pin is the location and the
 * text is the student's label. Placing a pin fills the field by reverse
 * lookup unless the student typed the text themselves.
 */
export function AddressCombobox({
  state,
  onChange,
  error,
}: {
  state: AddressState;
  onChange: (next: AddressState) => void;
  error?: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  // Suggestions are remembered with the query they answer, so stale ones never show.
  const [result, setResult] = useState<{ q: string; hits: GeocodeHit[] } | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [active, setActive] = useState(-1);
  const [status, setStatus] = useState("");
  const [picked, setPicked] = useState<string | null>(state.mode === "picked" ? state.text : null);
  const textSource = useRef<"typed" | "auto">(state.text && state.lat === null ? "typed" : "auto");
  const seq = useRef(0);
  const lastPin = useRef<string>("");

  const q = state.text.trim();
  const hits = result?.q === q ? result.hits : [];
  const open = state.mode === "none" && q.length >= 3 && hits.length > 0 && dismissed !== q;

  // Validity, in the browser's words, so the form will not submit a bare string.
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    const valid = state.text === "" || state.mode === "pinned" || (state.mode === "picked" && state.text === picked);
    el.setCustomValidity(valid ? "" : "Pick your address from the suggestions, or tap your place on the map.");
  }, [state, picked]);

  // Suggestions, 350 ms after the last keystroke, three characters or more.
  useEffect(() => {
    if (state.mode !== "none" || q.length < 3) return;
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      setStatus("Searching…");
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
        if (mine !== seq.current) return;
        if (!res.ok) throw new Error(String(res.status));
        const list = (await res.json()) as GeocodeHit[];
        setResult({ q, hits: list });
        setActive(-1);
        setStatus(
          list.length > 0
            ? `${list.length} suggestion${list.length === 1 ? "" : "s"}. Use the arrow keys, then Enter.`
            : `No match for “${q}”. Try just the number and street, like “62 King St”, or tap your place on the map.`,
        );
      } catch {
        if (mine === seq.current) setStatus("Couldn’t search addresses right now. Tap your place on the map instead.");
      }
    }, 350);
    return () => clearTimeout(t);
  }, [q, state.mode]);

  // A pin placed by hand: fill the field by reverse lookup unless the student typed it.
  useEffect(() => {
    if (state.mode !== "pinned" || state.lat === null || state.lon === null) return;
    const key = `${state.lat},${state.lon}`;
    if (key === lastPin.current) return;
    lastPin.current = key;
    if (textSource.current !== "auto") return;
    const mine = ++seq.current;
    const { lat, lon } = state;
    const t = setTimeout(async () => {
      setStatus("Looking up the address…");
      try {
        const r = await fetch(`/api/geocode?lat=${lat}&lon=${lon}`);
        if (mine !== seq.current) return;
        if (r.status === 404) {
          setStatus("Couldn’t find a street address there. Type one in; the pin is what counts.");
          return;
        }
        if (!r.ok) throw new Error(String(r.status));
        const j = (await r.json()) as { short_name: string };
        onChange({ text: j.short_name, lat, lon, mode: "pinned" });
        setStatus("Pin placed. The address filled in from the map.");
      } catch {
        if (mine === seq.current) setStatus("Couldn’t look up the address there right now. Type one in; the pin is what counts.");
      }
    }, 0);
    return () => clearTimeout(t);
  }, [state, onChange]);

  const pick = (hit: GeocodeHit) => {
    seq.current++;
    textSource.current = "auto";
    setPicked(hit.display_name);
    setResult(null);
    setStatus("Address set. The pin is on the map.");
    onChange({ text: hit.display_name, lat: hit.lat, lon: hit.lon, mode: "picked" });
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`${id}-input`} className="text-sm font-bold">
        Address
      </label>
      <div className="relative">
        <input
          ref={input}
          id={`${id}-input`}
          name="search_place"
          type="text"
          aria-invalid={error ? true : undefined}
          className="field"
          placeholder="Start typing, e.g. 62 King St"
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={open && active >= 0 ? `${id}-opt-${active}` : undefined}
          aria-describedby={`${id}-hint`}
          value={state.text}
          required
          onChange={(e) => {
            textSource.current = "typed";
            setDismissed(null);
            // Editing a picked address un-picks it; a pinned one keeps its pin.
            const pinned = state.mode === "pinned";
            onChange({ text: e.target.value, mode: pinned ? "pinned" : "none", lat: pinned ? state.lat : null, lon: pinned ? state.lon : null });
          }}
          onKeyDown={(e) => {
            if (!open) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(hits.length - 1, a + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === "Enter" && active >= 0) {
              e.preventDefault();
              pick(hits[active]);
            } else if (e.key === "Escape" || e.key === "Tab") {
              setDismissed(q);
            }
          }}
          onBlur={() => setTimeout(() => setDismissed(q), 150)}
        />
        {open && (
          <ul id={`${id}-list`} role="listbox" className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-line bg-paper shadow-lg">
            {hits.map((h, i) => (
              <li
                key={`${h.lat},${h.lon},${i}`}
                id={`${id}-opt-${i}`}
                role="option"
                aria-selected={i === active}
                className={`cursor-pointer px-3 py-2 text-sm ${i === active ? "bg-notice-tint" : "hover:bg-line-light"}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(h)}
              >
                <span className="font-bold">{h.short_name}</span>
                <span className="block text-xs text-ink-3">{h.display_name}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <input type="hidden" name="lat" value={state.lat ?? ""} />
      <input type="hidden" name="lon" value={state.lon ?? ""} />
      <p id={`${id}-hint`} className="text-xs text-ink-3">
        Pick a suggestion, or tap your place on the map and the address fills in. Only signed-in students see your address;
        shared links show how far it is from campus, never the street.
      </p>
      <p className="text-xs text-ink-2" aria-live="polite">
        {status}
      </p>
      {error && <p className="text-sm text-error-ink">{error}</p>}
    </div>
  );
}
