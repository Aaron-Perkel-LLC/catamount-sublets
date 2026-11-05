import Link from "next/link";
import { SITE } from "@/config/site";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-4 py-10">
      <h1 className="text-2xl font-bold">There&apos;s nothing here</h1>
      <p className="text-ink-2">That page doesn&apos;t exist, or the link was incomplete.</p>
      <div className="flex gap-3">
        <Link href="/browse" className="btn-primary">
          Browse sublets
        </Link>
        <Link href="/" className="btn-secondary">
          Front page
        </Link>
      </div>
      <p className="text-xs text-ink-3">{SITE.disclaimer}</p>
    </main>
  );
}
