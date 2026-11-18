import "server-only";
import { ACCESS } from "@/config/site";
import type { Db } from "@/db";
import PosterMessageEmail, { posterMessageSubject, posterMessageText } from "@/emails/poster-message";
import { appUrl } from "@/env";
import { formatMoney } from "@/lib/format";
import { containsLink, posterMessageInput, type RelayStatus } from "@/lib/poster-message";
import { canMessagePosters, viewerLevelOf } from "@/lib/viewer";
import { getNames } from "@/server/data/names";
import {
  claimPosterMessage,
  posterMessageByKey,
  relayTarget,
  releasePosterMessage,
  retakeStalePosterMessage,
  settlePosterMessage,
} from "@/server/data/poster-messages";
import { assertWritable, ReadOnlyError } from "@/server/data/settings";
import { digestResendKey } from "@/server/digest-config";
import { mailMode, sendMail } from "@/server/email/send";
import { log } from "@/server/log";
import { RATE_LIMITS, type RateLimitRule, takeRateLimit } from "@/server/rate-limit";

/**
 * The message relay: a community account (an address outside the schools)
 * writes to a poster through the site, because it may not see the poster's
 * contact details. The email goes from the updates subdomain (never the
 * address that sends sign-in codes) with Reply-To set to the sender, so the
 * poster answers them directly and the site is out of the conversation.
 *
 * Guards, in order: the sender is a community account; the listing is on
 * the public board (the only listings they can see); the poster accepts
 * outside messages and has not asked for no email; the text passes the
 * shared schema (length, no links); then the rate limits (per sender, per
 * sender and listing, per listing). Each message is stored for abuse review
 * (180 days; the admin's Messages section), claimed before the send under the
 * form's idempotency key, so a double tap is one email.
 */

export const RELAY_NOT_ACCEPTING = `This poster isn't accepting messages from people ${ACCESS.outside}.`;
export const RELAY_UNAVAILABLE = "Messaging posters isn't available right now. Try again later.";
const RETRY_PENDING_AFTER_MS = 5 * 60_000;

export interface RelaySender {
  id: string;
  email: string;
  role: "user" | "admin";
  tier: string;
}

/** Why the relay cannot send at all here; empty when it can. Mail that would need the updates key never falls back to the root key. */
export function relayBlockers(): string[] {
  if (mailMode() === "unconfigured") return ["RESEND_API_KEY is not set on this deployment."];
  if (mailMode() === "resend" && !digestResendKey()) return ["RESEND_DIGEST_API_KEY (the updates subdomain's sending key) is not set on this deployment."];
  return [];
}

export type { RelayStatus };

/** What the Message poster form should show for this listing, for a community account. Says nothing about a listing they can't see. */
export async function relayStatusFor(db: Db, sender: RelaySender, listingId: unknown): Promise<RelayStatus> {
  if (!canMessagePosters(viewerLevelOf(sender))) return "not_found";
  if (typeof listingId !== "number" || !Number.isInteger(listingId) || listingId <= 0) return "not_found";
  const target = await relayTarget(db, listingId);
  if (!target || target.posterId === sender.id) return "not_found";
  if (!target.accepting) return "not_accepting";
  return relayBlockers().length > 0 ? "unavailable" : "open";
}

export type RelayResult = { ok: true; duplicate: boolean } | { ok: false; error: string; fieldErrors?: { body?: string } };

export async function sendPosterMessage(db: Db, sender: RelaySender, raw: unknown): Promise<RelayResult> {
  if (!canMessagePosters(viewerLevelOf(sender))) return { ok: false, error: "Students can email or call the poster from the listing." };
  const parsed = posterMessageInput.safeParse(raw);
  if (!parsed.success) {
    const body = parsed.error.issues.find((i) => i.path[0] === "body")?.message;
    return { ok: false, error: body ?? "Check your message.", fieldErrors: body ? { body } : undefined };
  }
  const input = parsed.data;
  try {
    await assertWritable(db);
  } catch (e) {
    if (e instanceof ReadOnlyError) return { ok: false, error: e.message };
    throw e;
  }

  const target = await relayTarget(db, input.listingId);
  if (!target || target.posterId === sender.id) return { ok: false, error: "That listing isn't up any more." };
  if (!target.accepting) return { ok: false, error: RELAY_NOT_ACCEPTING };
  if (relayBlockers().length > 0) {
    log.warn("relay.blocked", { listingId: target.listingId });
    return { ok: false, error: RELAY_UNAVAILABLE };
  }

  const names = await getNames(db, sender.id);
  if (!names.complete) return { ok: false, error: "Add your name on your Account page first: posters see it." };
  const senderName = `${names.first} ${names.last}`;
  // Names saved before the rule refused web addresses (checkName) still can't carry one into the email.
  if (containsLink(senderName)) return { ok: false, error: "Your name on your Account page looks like a web address. Change it there first: posters see it." };

  const key = `poster-message/${sender.id}/${input.idempotencyKey}`;
  const claimed = await claimPosterMessage(db, { listingId: target.listingId, posterId: target.posterId, senderId: sender.id, body: input.body, idempotencyKey: key });
  let id: number;
  if (claimed !== null) {
    const limited = await rateLimited(db, sender.id, target.listingId);
    if (limited) {
      await releasePosterMessage(db, claimed);
      return { ok: false, error: limited };
    }
    id = claimed;
  } else {
    const prev = await posterMessageByKey(db, key);
    if (!prev || prev.senderId !== sender.id) return { ok: false, error: "That message is still sending." };
    // A key is one message: a retry must be the same text to the same listing, or a stuck row would let a different message out past the limits.
    if (prev.listingId !== target.listingId || prev.body !== input.body) return { ok: false, error: "That message is still sending. Close the form and start a new one." };
    if (prev.status === "sent") return { ok: true, duplicate: true };
    if (prev.status === "failed") return { ok: false, error: "That message didn't go through. Close the form and try again." };
    const staleBefore = new Date(Date.now() - RETRY_PENDING_AFTER_MS);
    if (prev.attemptedAt >= staleBefore || !(await retakeStalePosterMessage(db, prev.id, staleBefore))) return { ok: false, error: "That message is still sending." };
    id = prev.id;
  }

  const props = {
    senderName,
    senderEmail: sender.email,
    body: input.body,
    listingLine: [`${formatMoney(target.price)}/mo`, target.semesterLabel].filter(Boolean).join(" · "),
    settingsUrl: `${appUrl()}/post`,
  };
  const sent = await sendMail({
    to: target.posterEmail,
    subject: posterMessageSubject(senderName),
    react: PosterMessageEmail(props),
    text: posterMessageText(props),
    kind: "poster_message",
    replyTo: sender.email,
    ref: id,
    idempotencyKey: key,
    apiKey: digestResendKey(),
  });
  if (!sent.ok) {
    await settlePosterMessage(db, id, { status: "failed", error: sent.error ?? "The send failed." });
    log.warn("relay.failed", { ref: id, listingId: target.listingId });
    return { ok: false, error: "Your message didn't go through. Try again in a few minutes." };
  }
  await settlePosterMessage(db, id, { status: "sent", resendId: sent.id ?? null });
  log.info("relay.sent", { ref: id, listingId: target.listingId });
  return { ok: true, duplicate: false };
}

/** All three limits, each counted only when the ones before it pass; the refusal to show, or null. */
async function rateLimited(db: Db, senderId: string, listingId: number): Promise<string | null> {
  const checks: [RateLimitRule, string, string][] = [
    [RATE_LIMITS.posterMessagePerSender, senderId, `You've sent ${RATE_LIMITS.posterMessagePerSender.limit} messages today. Try again tomorrow.`],
    [RATE_LIMITS.posterMessagePerSenderListing, `${senderId}:${listingId}`, "You've already messaged this poster today. Give them time to reply."],
    [RATE_LIMITS.posterMessagePerListing, String(listingId), "This poster has had a lot of messages today. Try again tomorrow."],
  ];
  for (const [rule, subject, message] of checks) {
    const r = await takeRateLimit(db, rule, subject);
    if (!r.allowed) {
      log.warn("relay.rate_limited", { scope: rule.scope, listingId });
      return message;
    }
  }
  return null;
}
