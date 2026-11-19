import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { announceUnsubscribe } from "@/server/services/email";

export const runtime = "nodejs";

/**
 * RFC 8058 one-click unsubscribe for the admin's group email: its
 * List-Unsubscribe header points here and List-Unsubscribe-Post tells the
 * mail client to POST `List-Unsubscribe=One-Click`. The POST comes from the
 * mail provider, not a page of ours, so there is no same-origin check: the
 * signed token in the URL is the whole authorisation, and all it can do is
 * mark that account Stop email.
 *
 * A GET (a link scanner, or someone pasting the URL) changes nothing and
 * goes to the confirm page, where unsubscribing takes a tap.
 */
export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get("t") ?? "";
  const r = await announceUnsubscribe(await getDb(), token, "one_click");
  return new NextResponse(r.ok ? "Unsubscribed from announcements." : "That unsubscribe link isn't valid.", {
    status: r.ok ? 200 : 400,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const page = new URL(`/unsubscribe?t=${encodeURIComponent(url.searchParams.get("t") ?? "")}`, url);
  return NextResponse.redirect(page, { status: 303, headers: { "cache-control": "no-store" } });
}
