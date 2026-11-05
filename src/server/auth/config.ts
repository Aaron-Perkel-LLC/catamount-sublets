import { desc, eq } from "drizzle-orm";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { admin, emailOTP } from "better-auth/plugins";
import { OTP, SITE } from "@/config/site";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import { appUrl, isProductionEnv } from "@/env";
import { checkEmailAllowed, type EmailAllowResult, emailRefusalMessage, normalizeEmail } from "@/lib/auth-allow";
import OtpCodeEmail from "@/emails/otp-code";
import { isEmailApproved } from "@/server/data/access-requests";
import { sendMail } from "@/server/email/send";
import { log } from "@/server/log";
import { RATE_LIMITS, takeRateLimit } from "@/server/rate-limit";

/**
 * The better-auth configuration. Built once per process by getAuth() in
 * ./index.ts, and by scripts/auth-cli-config.ts for schema generation.
 *
 * Who may sign in is decided by assertEmailAllowed() in two places: the
 * before-hook on the code endpoints (nothing is mailed to a refused address)
 * and the user-create database hook (no row from any path). Hard rule 5.
 * An address outside the allowed domains passes when the admin approved its
 * access request (src/server/data/access-requests.ts).
 */

/** Endpoints that take an email and must pass the allow rule first. */
const GATED_PATHS = new Set([
  "/email-otp/send-verification-otp",
  "/sign-in/email-otp",
  "/email-otp/verify-email",
  "/email-otp/check-verification-otp",
]);

export function buildAuth(db: Db) {
  /** The caller's IP as Vercel reports it; "unknown" groups requests with no header (tests, the CLI). */
  const ipOf = (headers: Headers | undefined) =>
    headers?.get("x-forwarded-for")?.split(",")[0]?.trim() || headers?.get("x-real-ip") || "unknown";

  /** The config rule, then the admin's approvals for an address refused only for its domain. */
  const allowed = async (raw: string): Promise<EmailAllowResult> => {
    const result = checkEmailAllowed(raw);
    if (!result.ok && result.reason === "domain" && (await isEmailApproved(db, result.email))) return { ok: true, email: result.email };
    return result;
  };

  const tooMany = (message: string) => new APIError("TOO_MANY_REQUESTS", { message });

  /** Before a code is sent: the 60 s cooldown per address, then the per-address and per-IP windows. */
  const sendThrottle = async (email: string, ip: string) => {
    const now = Date.now();
    const [last] = await db
      .select({ sentAt: schema.otpSends.sentAt })
      .from(schema.otpSends)
      .where(eq(schema.otpSends.email, email))
      .orderBy(desc(schema.otpSends.sentAt))
      .limit(1);
    if (last && now - last.sentAt.getTime() < OTP.resendCooldownSeconds * 1000) {
      throw tooMany("A code was just sent. Check your inbox (and Junk), or try again in a minute.");
    }
    const perEmail = await takeRateLimit(db, RATE_LIMITS.otpSendPerEmail, email);
    if (!perEmail.allowed) throw tooMany("Too many codes requested for this address. Try again in an hour.");
    const perIp = await takeRateLimit(db, RATE_LIMITS.otpSendPerIp, ip);
    if (!perIp.allowed) throw tooMany("Too many sign-in attempts from this network. Try again in a few minutes.");
  };

  /** Before a code is checked: attempts per address across codes, and per IP. */
  const verifyThrottle = async (email: string, ip: string) => {
    const perEmail = await takeRateLimit(db, RATE_LIMITS.otpVerifyPerEmail, email);
    if (!perEmail.allowed) throw tooMany("Too many attempts for this address. Request a new code in a few minutes.");
    const perIp = await takeRateLimit(db, RATE_LIMITS.otpVerifyPerIp, ip);
    if (!perIp.allowed) throw tooMany("Too many attempts from this network. Try again in a few minutes.");
  };

  return betterAuth({
    appName: SITE.name,
    baseURL: appUrl(),
    basePath: "/api/auth",
    secret: process.env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, { provider: "pg", schema }),
    trustedOrigins: [appUrl(), SITE.url, "https://*.vercel.app"],
    emailAndPassword: { enabled: false },

    user: {
      additionalFields: {
        legacyNetid: { type: "string", required: false, input: false },
        lastLoginAt: { type: "date", required: false, input: false },
        firstName: { type: "string", required: false, input: false },
        lastName: { type: "string", required: false, input: false },
      },
    },

    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },

    advanced: {
      cookiePrefix: "catamount",
      useSecureCookies: isProductionEnv(),
      database: { generateId: "uuid" },
    },

    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 60,
      // better-auth's own per-IP limiter, as a backstop. The real limits are
      // in src/server/rate-limit.ts; these are loose because campus networks
      // put many people behind one address.
      customRules: {
        "/email-otp/send-verification-otp": { window: 600, max: 40 },
        "/sign-in/email-otp": { window: 600, max: 80 },
      },
    },

    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (!GATED_PATHS.has(ctx.path)) return;
        const raw = (ctx.body as { email?: unknown } | undefined)?.email;
        if (typeof raw !== "string") {
          throw new APIError("BAD_REQUEST", { message: "Enter your email address." });
        }
        const result = await allowed(raw);
        if (!result.ok) {
          throw new APIError("BAD_REQUEST", { message: emailRefusalMessage(result.reason) });
        }
        const ip = ipOf(ctx.headers);
        if (ctx.path === "/email-otp/send-verification-otp") await sendThrottle(result.email, ip);
        else await verifyThrottle(result.email, ip);
        return { context: { ...ctx, body: { ...(ctx.body as object), email: result.email } } };
      }),
    },

    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const result = await allowed(user.email);
            if (!result.ok) {
              throw new APIError("BAD_REQUEST", { message: emailRefusalMessage(result.reason) });
            }
            const name = typeof user.name === "string" && user.name.trim() ? user.name.trim() : result.email.split("@")[0];
            return { data: { ...user, email: result.email, name } };
          },
        },
      },
      session: {
        create: {
          after: async (session) => {
            await db.update(schema.user).set({ lastLoginAt: new Date() }).where(eq(schema.user.id, session.userId));
          },
        },
      },
    },

    plugins: [
      emailOTP({
        otpLength: OTP.length,
        expiresIn: OTP.expiresInSeconds,
        allowedAttempts: OTP.allowedAttempts,
        storeOTP: "hashed",
        resendStrategy: "rotate",
        sendVerificationOTP: async ({ email, otp, type }) => {
          if (type !== "sign-in") return; // the only flow this site uses
          const to = normalizeEmail(email);
          await db.insert(schema.otpSends).values({ email: to });
          // Awaited: a send that fails must reach the person as an error, not a
          // silent "check your inbox". Timing leaks nothing, since a new and an
          // existing address take the identical path to this point.
          const r = await sendMail({
            to,
            subject: `${otp} is your ${SITE.name} sign-in code`,
            react: OtpCodeEmail({ code: otp }),
            kind: "login_code",
          });
          if (!r.ok) {
            log.error("auth.code_not_sent", new Error("send failed"));
            throw new APIError("SERVICE_UNAVAILABLE", {
              message: `We couldn't send your code just now. Try again in a minute, or email ${SITE.supportEmail}.`,
            });
          }
        },
      }),
      admin({ defaultRole: "user", adminRoles: ["admin"] }),
      nextCookies(), // must stay last
    ],
  });
}

export type Auth = ReturnType<typeof buildAuth>;
