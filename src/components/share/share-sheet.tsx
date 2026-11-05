"use client";

import { Copy, Mail, MessageSquare, Share2, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { SITE } from "@/config/site";
import { copyToClipboard } from "@/lib/clipboard";
import type { EventSource, ShareTarget } from "@/lib/options";
import { track } from "@/lib/track";

export interface ShareRequest {
  url: string;
  price: string;
  semester: string;
  listingId: number;
  source: EventSource;
}

interface ShareApi {
  open: (req: ShareRequest) => void;
}

const Ctx = createContext<ShareApi | null>(null);

/**
 * The share sheet. Which tiles apply is a property of the browser: "Share
 * to…" needs navigator.share; the Instagram and Snapchat tiles fetch the
 * story image and hand it to the OS share sheet as a file, which is what
 * makes those apps appear as targets at all. A desktop downloads the image
 * instead.
 */
export function ShareSheetProvider({ children }: { children: ReactNode }) {
  const [req, setReq] = useState<ShareRequest | null>(null);
  const open = useCallback((r: ShareRequest) => {
    track("share_open", r.listingId, r.source);
    setReq(r);
  }, []);
  const api = useMemo(() => ({ open }), [open]);
  return (
    <Ctx.Provider value={api}>
      {children}
      {req && <ShareSheet key={req.listingId} req={req} onClose={() => setReq(null)} />}
    </Ctx.Provider>
  );
}

export function useShareSheet(): ShareApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useShareSheet outside ShareSheetProvider");
  return ctx;
}

type Tile = { key: ShareTarget; label: string; when?: () => boolean };
const TILES: Tile[] = [
  { key: "native", label: "Share to…", when: () => typeof navigator !== "undefined" && typeof navigator.share === "function" },
  { key: "instagram", label: "Insta Story" },
  { key: "snapchat", label: "Snapchat" },
  { key: "text", label: "Text" },
  { key: "email", label: "Email" },
  { key: "x", label: "X" },
];

function ShareSheet({ req, onClose }: { req: ShareRequest; onClose: () => void }) {
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<ShareTarget | null>(null);
  const [copied, setCopied] = useState<"idle" | "ok" | "fail">("idle");
  const closeBtn = useRef<HTMLButtonElement>(null);
  const tiles = TILES.filter((t) => !t.when || t.when());
  const message = `Check out this ${req.price} sublet for ${req.semester} on ${SITE.name}`;

  useEffect(() => {
    closeBtn.current?.focus();
    // Capture phase, so Escape closes this and not the listing view beneath it.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const log = (target: ShareTarget) => track("share_target", req.listingId, req.source, target);

  async function run(tile: Tile) {
    log(tile.key);
    switch (tile.key) {
      case "native":
        try {
          await navigator.share({ title: SITE.name, text: message, url: req.url });
        } catch {
          /* cancelled */
        }
        return;
      case "text":
        window.location.assign(`sms:?&body=${encodeURIComponent(`${message} ${req.url}`)}`);
        return;
      case "email":
        window.location.assign(`mailto:?subject=${encodeURIComponent(message)}&body=${encodeURIComponent(`${message}\n\n${req.url}`)}`);
        return;
      case "x":
        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(message)}&url=${encodeURIComponent(req.url)}`, "_blank", "noopener");
        return;
      case "instagram":
      case "snapchat":
        await shareStory(tile.key === "instagram" ? "Instagram" : "Snapchat");
        return;
      default:
        return;
    }
  }

  async function shareStory(app: string) {
    const slug = /\/s\/([0-9]+-[a-f0-9]{10})/.exec(req.url)?.[1];
    if (!slug) {
      setNote("This listing has no share link yet.");
      return;
    }
    setBusy(app === "Instagram" ? "instagram" : "snapchat");
    setNote("Building your story image…");
    try {
      const res = await fetch(`/share-card/${slug}/story`);
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const file = new File([blob], "catamount-sublet-story.png", { type: "image/png" });
      if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], text: req.url });
          setNote("Shared.");
        } catch (e) {
          if ((e as Error).name === "AbortError") setNote(null);
          else download(file, app);
        }
      } else download(file, app);
    } catch {
      setNote("Could not build the story image — copy the link instead.");
    } finally {
      setBusy(null);
    }
  }

  function download(file: File, app: string) {
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    setNote(`Story image saved — open ${app} and add it to your story.`);
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/60 sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" aria-label="Share this listing" className="w-full max-w-md rounded-t-2xl bg-paper p-5 shadow-xl sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Share this listing</h2>
          <button ref={closeBtn} type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 hover:bg-line-light">
            <X aria-hidden />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {tiles.map((t) => (
            <button
              key={t.key}
              type="button"
              disabled={busy !== null}
              aria-busy={busy === t.key}
              onClick={() => void run(t)}
              className="flex flex-col items-center gap-1.5 rounded-xl border border-line bg-cream px-2 py-3 text-sm font-bold text-ink hover:border-lake disabled:opacity-60"
            >
              {t.key === "email" ? <Mail aria-hidden /> : t.key === "text" ? <MessageSquare aria-hidden /> : <Share2 aria-hidden />}
              {t.label}
            </button>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <input type="text" readOnly value={req.url} aria-label="Share link" className="field text-sm" onFocus={(e) => e.target.select()} />
          <button
            type="button"
            className={`btn-secondary shrink-0 gap-1.5 px-3 ${copied === "ok" ? "border-included-line bg-included-tint text-included-ink" : ""} ${copied === "fail" ? "border-error-line bg-error-tint text-error-ink" : ""}`}
            onClick={async () => {
              log("copy");
              setCopied((await copyToClipboard(req.url)) ? "ok" : "fail");
              setTimeout(() => setCopied("idle"), 1600);
            }}
          >
            <Copy className="h-4 w-4" aria-hidden /> {copied === "ok" ? "Copied!" : copied === "fail" ? "Copy failed" : "Copy"}
          </button>
        </div>
        <p className="mt-3 min-h-5 text-xs text-ink-2" aria-live="polite">
          {note ?? "Anyone with this link sees the price, semester, size and distance from campus. The address and contact details stay behind sign-in."}
        </p>
      </div>
    </div>
  );
}
