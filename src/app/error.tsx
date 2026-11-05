"use client";

import { SITE } from "@/config/site";

/** Something threw while rendering. Nothing about the error is shown: it may carry data. */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-4 py-10">
      <h1 className="text-2xl font-bold">Something went wrong</h1>
      <p className="text-ink-2">Sorry about that. Try again in a moment; if it keeps happening, email {SITE.supportEmail}.</p>
      <button type="button" className="btn-primary self-start" onClick={() => reset()}>
        Try again
      </button>
    </main>
  );
}
