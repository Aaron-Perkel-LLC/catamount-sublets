"use client";

import { useEffect, useState } from "react";
import { ImagesTab, type StorageUsage } from "../ImagesTab";
import type { SemesterRowDto } from "../types";

/** Photos, with #images:<id> (a listing's photo count, an old link) showing just that listing's. */
export function PhotosSection({ semesters, storage }: { semesters: SemesterRowDto[]; storage: StorageUsage }) {
  const [focus, setFocus] = useState<number | null>(null);
  useEffect(() => {
    const read = () => {
      const m = /^#images:(\d{1,9})$/.exec(window.location.hash);
      setFocus(m ? Number(m[1]) : null);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  return <ImagesTab focusListingId={focus} semesters={semesters} storage={storage} />;
}
