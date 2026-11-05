import { NextResponse } from "next/server";
import { readLocalMedia, storageMode } from "@/server/storage";

const TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };

/** Serves .uploads/media in local storage mode only. Never active with Blob tokens set. */
export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  if (storageMode() !== "local") return new NextResponse("Not found", { status: 404 });
  const { path } = await params;
  if (path[0] !== "media" || path.some((p) => p.includes(".."))) return new NextResponse("Not found", { status: 404 });
  const data = await readLocalMedia(path.slice(1).join("/"));
  if (!data) return new NextResponse("Not found", { status: 404 });
  const ext = path[path.length - 1].split(".").pop() ?? "";
  return new NextResponse(new Uint8Array(data), {
    headers: { "Content-Type": TYPES[ext] ?? "application/octet-stream", "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
