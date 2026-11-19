import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DirectionA } from "@/components/admin-lab/DirectionA";
import { DirectionB } from "@/components/admin-lab/DirectionB";
import type { AdminSearchParams } from "@/lib/admin-page";
import { requireAdminPage } from "@/server/auth";
import { loadOverview } from "../load";

export const metadata: Metadata = { title: "Admin mockup" };

/**
 * Phase 32b, step 1: two directions for the admin's Overview, drawn from
 * nothing but the data and the palette, for the admin to pick one. Linked
 * from nowhere; deleted once the pick is applied to the real pages.
 */
export default async function AdminLab({ params, searchParams }: { params: Promise<{ dir: string }>; searchParams: AdminSearchParams }) {
  const { dir } = await params;
  if (dir !== "a" && dir !== "b") notFound();
  const base = `/admin-lab/${dir}`;
  await requireAdminPage(base);
  const vm = await loadOverview(searchParams);
  const other = dir === "a" ? "b" : "a";
  return (
    <div className="flex flex-col gap-8">
      {dir === "a" ? <DirectionA vm={vm} base={base} /> : <DirectionB vm={vm} base={base} />}
      <p className="text-xs text-ink-3">
        Mockup {dir.toUpperCase()} of two.{" "}
        <Link href={`/admin-lab/${other}?${vm.nav.query}`} className="inline-flex min-h-11 items-center font-bold text-lake hover:underline">
          See {other.toUpperCase()}
        </Link>
      </p>
    </div>
  );
}
