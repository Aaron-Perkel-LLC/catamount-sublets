/**
 * The title a signed-out visitor sees in place of the address: size and
 * neighborhood only ("2BR · Old North End", "Studio · Downtown").
 */
export function publicTitle(bedrooms: number | null, neighborhood: string): string {
  const size = bedrooms === null ? "Sublet" : bedrooms === 0 ? "Studio" : `${bedrooms}BR`;
  return `${size} · ${neighborhood}`;
}
