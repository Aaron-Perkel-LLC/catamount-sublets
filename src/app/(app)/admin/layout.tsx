import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SITE } from "@/config/site";
import { getDb } from "@/db";
import { AdminShell } from "@/components/admin/AdminShell";
import { requireAdminPage } from "@/server/auth";
import { listPendingAccessRequests } from "@/server/data/access-requests";

export const metadata: Metadata = { title: `Admin · ${SITE.name}` };
/** The broadcast, the one-off mail and the "still available?" email run as Server Actions here and pace themselves under a second per person; this covers several hundred. */
export const maxDuration = 800;

/**
 * The admin's frame: sections grouped in a sidebar (a picker on a phone),
 * the quick-jump box and the listing view. The check here only decides
 * whether to draw the frame; every page under it checks the admin itself
 * (requireAdminPage), since a layout does not guard its pages.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const me = await requireAdminPage("/admin");
  const waiting = (await listPendingAccessRequests(await getDb())).length;
  return (
    <AdminShell viewer={{ signature: me.name && me.name !== me.email.split("@")[0] ? me.name : null, isAdmin: true }} waiting={waiting}>
      {children}
    </AdminShell>
  );
}
