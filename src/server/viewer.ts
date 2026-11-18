import { cache } from "react";
import { audienceFor, type Audience, canMessagePosters, canPost, seesFullListings, type ViewerLevel, type ViewerRef, viewerLevelOf } from "@/lib/viewer";
import { ForbiddenError, getSessionUser, type SessionUser } from "@/server/auth";

/**
 * The viewer level for this request: the one function every read path asks
 * (pages, metadata, route handlers, Server Actions). See src/lib/viewer.ts
 * for what each level may see. Banned accounts have no session, so they are
 * anonymous.
 */
export type Viewer = { level: "anonymous"; user: null } | { level: Exclude<ViewerLevel, "anonymous">; user: SessionUser };

export function viewerFor(user: SessionUser | null): Viewer {
  if (!user) return { level: "anonymous", user: null };
  return { level: viewerLevelOf(user) as Exclude<ViewerLevel, "anonymous">, user };
}

export const getViewer = cache(async function getViewer(): Promise<Viewer> {
  return viewerFor(await getSessionUser());
});

/** For the data layer, which takes ids, never the session. */
export function refOf(v: Viewer): ViewerRef {
  return v.user ? { level: v.level as Exclude<ViewerLevel, "anonymous">, userId: v.user.id } : { level: "anonymous", userId: null };
}

export function viewerAudience(v: Viewer): Audience {
  return audienceFor(v.level);
}

/** A student or the admin, or ForbiddenError (Server Actions and route handlers). */
export async function requireStudentOrThrow(): Promise<SessionUser> {
  const v = await getViewer();
  if (!v.user || !seesFullListings(v.level)) throw new ForbiddenError();
  return v.user;
}

/** Someone who may post (students and the admin), or ForbiddenError. */
export async function requirePosterOrThrow(): Promise<SessionUser> {
  const v = await getViewer();
  if (!v.user || !canPost(v.level)) throw new ForbiddenError();
  return v.user;
}

/** A community account, or ForbiddenError: the message relay is theirs alone. */
export async function requireCommunityOrThrow(): Promise<SessionUser> {
  const v = await getViewer();
  if (!v.user || !canMessagePosters(v.level)) throw new ForbiddenError();
  return v.user;
}
