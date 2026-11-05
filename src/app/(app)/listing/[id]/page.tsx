import { redirect } from "next/navigation";

/**
 * A direct link to one listing (the old /app/index.php?id=N form, admin
 * notices) opens the board with that listing's view on top.
 */
export default async function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number.parseInt(id, 10);
  redirect(Number.isInteger(n) && n > 0 ? `/browse?id=${n}` : "/browse");
}
