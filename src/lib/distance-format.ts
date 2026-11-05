/** "0.4 mi from campus" — one decimal, as the legacy showed it. */
export function formatMiles(miles: number): string {
  return `${miles.toFixed(1)} mi from campus`;
}
