"use client";

import { useEffect, useState } from "react";
import { useAdmin } from "../AdminShell";
import { PeopleTab } from "../PeopleTab";
import type { PersonDto } from "../types";

/** People, with #people:<id> (a Poster link, an old link) scrolling to and flashing that row. */
export function PeopleSection({ people, initialSearch, meId }: { people: PersonDto[]; initialSearch: { q: string; ids: string[] | null }; meId: string }) {
  const { openPost } = useAdmin();
  const [focus, setFocus] = useState<{ id: string; n: number } | null>(null);
  useEffect(() => {
    const read = () => {
      const m = /^#people:([0-9a-f-]{36})$/i.exec(window.location.hash);
      setFocus(m ? { id: m[1], n: Date.now() } : null);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  return <PeopleTab people={people} initialSearch={initialSearch} meId={meId} focus={focus} onOpenPost={(id) => void openPost(id)} />;
}
