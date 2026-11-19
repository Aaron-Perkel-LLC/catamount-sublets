"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { legacyAdminTarget } from "@/lib/admin-hash";

/** On /admin: an old section link (#people, #images:187, the notices' #post:42) goes to where that section lives now. */
export function LegacyHashRedirect() {
  const router = useRouter();
  useEffect(() => {
    const target = legacyAdminTarget(window.location.hash);
    if (target) router.replace(target);
  }, [router]);
  return null;
}
