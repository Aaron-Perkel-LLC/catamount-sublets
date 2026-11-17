import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { requireUser } from "@/server/auth";

/** Nothing under (app) is for search engines: it is all behind sign-in. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Everything under (app) is for signed-in people. The session check happens
 * here, on the server, on every request; src/proxy.ts only does the cheap
 * cookie-presence redirect first.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  return <AppShell user={user}>{children}</AppShell>;
}
