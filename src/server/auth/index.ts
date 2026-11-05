import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { type Auth, buildAuth } from "./config";

let auth: Auth | undefined;
let pending: Promise<Auth> | undefined;

/** The better-auth instance, built on first use over the app database. */
export async function getAuth(): Promise<Auth> {
  if (auth) return auth;
  pending ??= getDb().then((db) => (auth = buildAuth(db)));
  return pending;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: "user" | "admin";
  legacyNetid: string | null;
}

/** The signed-in person, or null. Banned accounts have no session. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const a = await getAuth();
  const session = await a.api.getSession({ headers: await headers() });
  if (!session) return null;
  const u = session.user as typeof session.user & { role?: string; legacyNetid?: string | null };
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role === "admin" ? "admin" : "user",
    legacyNetid: u.legacyNetid ?? null,
  };
}

/** The signed-in person, or a redirect to sign-in that comes back to `next`. */
export async function requireUser(next?: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(`/sign-in${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  return user;
}

export class ForbiddenError extends Error {
  constructor() {
    super("Forbidden");
    this.name = "ForbiddenError";
  }
}

/** For Server Actions and Route Handlers: throws rather than redirects. */
export async function requireUserOrThrow(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new ForbiddenError();
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUserOrThrow();
  if (user.role !== "admin") throw new ForbiddenError();
  return user;
}
