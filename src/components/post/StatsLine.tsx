/** "12 people viewed · 3 got in touch · 2 share taps since Oct 9. Totals only, never who." */
export function statsText({ views, contacts, shares, since }: { views: number; contacts: number; shares: number; since: string }): string {
  const people = (n: number, what: string) => `${n} ${n === 1 ? "person" : "people"} ${what}`;
  return `${people(views, "viewed")} · ${people(contacts, "got in touch")} · ${shares} share tap${shares === 1 ? "" : "s"} since ${since}. Totals only, never who.`;
}
