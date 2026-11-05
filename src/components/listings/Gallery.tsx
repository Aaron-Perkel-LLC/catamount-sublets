"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

export interface Photo {
  display: string;
  thumb: string | null;
}

const preloaded = new Map<string, HTMLImageElement>();

/** Fetch a display image once so the next photo (or the next listing) is instant. */
export function preloadPhoto(url: string | undefined) {
  if (!url || typeof window === "undefined" || preloaded.has(url)) return;
  const img = new Image();
  img.onerror = () => preloaded.delete(url);
  img.src = url;
  preloaded.set(url, img);
}

/**
 * The photo strip in the listing view: arrows, dots, "1 / N", swipe and the
 * arrow keys. The thumbnail sits under the photo while the full-size copy
 * loads, then the photo fades in over it, so a previous photo never shows
 * under the new counter.
 */
export function Gallery({ photos, alt }: { photos: Photo[]; alt: string }) {
  // Mounted per listing (keyed by the parent), so index starts at 0 for each.
  const [index, setIndex] = useState(0);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [broken, setBroken] = useState<Set<string>>(() => new Set());
  const start = useRef<{ x: number; y: number } | null>(null);

  const count = photos.length;
  const photo = photos[index];
  const loaded = photo !== undefined && loadedUrl === photo.display;

  useEffect(() => {
    preloadPhoto(photos[index + 1]?.display);
    preloadPhoto(photos[index - 1]?.display);
  }, [index, photos]);

  const go = useCallback(
    (delta: number) => setIndex((i) => Math.min(count - 1, Math.max(0, i + delta))),
    [count],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  if (!photo) {
    return (
      <div className="flex aspect-[4/3] items-center justify-center bg-line-light text-sm text-ink-3" aria-hidden>
        No photos
      </div>
    );
  }

  const isBroken = broken.has(photo.display);

  return (
    <div
      className="relative aspect-[4/3] w-full touch-pan-y select-none overflow-hidden bg-ink"
      onPointerDown={(e) => {
        if (e.pointerType === "mouse") return;
        start.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        if (!start.current) return;
        const dx = e.clientX - start.current.x;
        const dy = e.clientY - start.current.y;
        start.current = null;
        if (Math.abs(dx) > 40 && Math.abs(dx) > 1.5 * Math.abs(dy)) go(dx < 0 ? 1 : -1);
      }}
    >
      {photo.thumb && !loaded && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo.thumb} alt="" aria-hidden className="absolute inset-0 h-full w-full object-contain blur-[2px]" />
      )}
      {isBroken ? (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-paper/80">Image not available</div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={photo.display}
          src={photo.display}
          alt={`${alt}, photo ${index + 1} of ${count}`}
          className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-200 ${loaded ? "opacity-100" : "opacity-0"}`}
          onLoad={() => setLoadedUrl(photo.display)}
          onError={() => setBroken((b) => new Set(b).add(photo.display))}
        />
      )}
      {index > 0 && (
        <button type="button" onClick={() => go(-1)} aria-label="Previous photo" className="gallery-nav left-2">
          <ChevronLeft aria-hidden />
        </button>
      )}
      {index < count - 1 && (
        <button type="button" onClick={() => go(1)} aria-label="Next photo" className="gallery-nav right-2">
          <ChevronRight aria-hidden />
        </button>
      )}
      {count > 1 && (
        <>
          <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5" aria-hidden>
            {photos.map((p, i) => (
              <button
                key={p.display}
                type="button"
                tabIndex={-1}
                onClick={() => setIndex(i)}
                className={`h-1.5 w-1.5 rounded-full ${i === index ? "bg-paper" : "bg-paper/50"}`}
              />
            ))}
          </div>
          <span className="absolute right-2 top-2 rounded-full bg-ink/70 px-2 py-0.5 text-xs text-paper" aria-live="polite">
            {index + 1} / {count}
          </span>
        </>
      )}
    </div>
  );
}
