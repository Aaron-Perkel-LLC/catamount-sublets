import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { LIMITS } from "@/config/site";
import { sameOrigin } from "@/server/http";
import { requireUserOrThrow } from "@/server/auth";
import { saveRawUploadLocal, storageMode } from "@/server/storage";

export const runtime = "nodejs";

const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"];

/**
 * Raw photo uploads.
 *
 * Blob mode: the client-upload token exchange. The browser sends the file
 * straight to the private `uploads` store (so the 4.5 MB function body limit
 * never applies); this route only mints the token, for a signed-in person,
 * with a server-chosen pathname. The file is then handed to attachPhoto().
 *
 * Local mode (no Blob tokens, development): the file itself arrives here as
 * multipart and is saved under .uploads/raw/.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Cross-site request blocked." }, { status: 403 });
  const user = await requireUserOrThrow().catch(() => null);
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  if (storageMode() === "local") {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "No file." }, { status: 400 });
    if (file.size > LIMITS.uploadMaxBytes) return NextResponse.json({ error: "That photo is over 30 MB." }, { status: 413 });
    const ref = await saveRawUploadLocal(Buffer.from(await file.arrayBuffer()));
    return NextResponse.json({ ref });
  }

  const body = (await request.json()) as HandleUploadBody;
  try {
    const json = await handleUpload({
      body,
      request,
      token: process.env.BLOB_UPLOADS_READ_WRITE_TOKEN,
      onBeforeGenerateToken: async () => ({
        access: "private",
        pathname: `raw/${user.id}/${randomBytes(16).toString("hex")}`,
        allowedContentTypes: ALLOWED,
        maximumSizeInBytes: LIMITS.uploadMaxBytes,
        addRandomSuffix: false,
        tokenPayload: JSON.stringify({ userId: user.id }),
      }),
      onUploadCompleted: async () => {
        // The client calls attachPhoto() itself once the upload returns; nothing to do here.
      },
    });
    return NextResponse.json(json);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
