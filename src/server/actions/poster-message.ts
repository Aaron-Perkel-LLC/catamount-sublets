"use server";

import { getDb } from "@/db";
import { requireCommunityOrThrow } from "@/server/viewer";
import type { RelayStatus } from "@/lib/poster-message";
import { relayStatusFor, type RelayResult, sendPosterMessage } from "@/server/services/poster-message";

/** Whether the Message poster form is open for this listing (community accounts only; the service checks again). */
export async function fetchRelayStatus(listingId: number): Promise<RelayStatus> {
  const user = await requireCommunityOrThrow();
  return relayStatusFor(await getDb(), user, listingId);
}

/** Send one message to a poster through the relay. */
export async function sendPosterMessageAction(input: { listingId: number; body: string; idempotencyKey: string }): Promise<RelayResult> {
  const user = await requireCommunityOrThrow();
  return sendPosterMessage(await getDb(), user, input);
}
