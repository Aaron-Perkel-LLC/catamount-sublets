import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { PublicShell } from "@/components/PublicShell";
import { getDb } from "@/db";
import { getSessionUser } from "@/server/auth";
import { noticeFor } from "@/server/data/notices";

/**
 * Browse, Map and a single listing: open to everyone. With a session they
 * render exactly as before, inside the signed-in frame (and its welcome
 * gate); without one, the pages take PublicListing only (CLAUDE.md rule 9).
 * Reading the session makes every render dynamic, and src/proxy.ts marks
 * these routes private and no-store, so no cache can serve one audience's
 * render to the other.
 */
export async function generateMetadata(): Promise<Metadata> {
  // A signed-in render is never for search engines; the signed-out pages set their own.
  return (await getSessionUser()) ? { robots: { index: false, follow: false } } : {};
}

export default async function BoardLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (user) return <AppShell user={user}>{children}</AppShell>;
  const notice = await noticeFor(await getDb(), { kind: "signed-out" });
  return <PublicShell notice={notice}>{children}</PublicShell>;
}
