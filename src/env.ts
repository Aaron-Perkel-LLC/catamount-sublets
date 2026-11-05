import { z } from "zod";

/**
 * Environment, validated once. Import getEnv() from server code only.
 *
 * Production (VERCEL_ENV=production) must have every secret; outside production
 * most are optional so `next build`, tests and a fresh clone work without an
 * account anywhere: no RESEND_API_KEY means console-mode mail, no DATABASE_URL
 * means the PGlite dev database (see src/db).
 */

const isProduction = process.env.VERCEL_ENV === "production";

const requiredInProduction = <T extends z.ZodType>(s: T) => (isProduction ? s : s.optional());

const schema = z.object({
  VERCEL_ENV: z.enum(["production", "preview", "development"]).optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  /** Neon, pooled. */
  DATABASE_URL: requiredInProduction(z.url()),
  /** Neon, direct (migrations). */
  DATABASE_URL_UNPOOLED: z.url().optional(),

  /** 32 random bytes, base64 or hex. Signs share tokens and actor keys. */
  APP_SECRET: requiredInProduction(z.string().min(32)),
  /**
   * Signs survey links, on its own so the send script can keep the same value
   * in .env.local and APP_SECRET is never read back or rotated. Never required:
   * a deployment without it has no valid survey links (src/server/survey-token.ts).
   */
  SURVEY_SECRET: z.string().optional(),
  /** better-auth's own secret for session tokens. */
  BETTER_AUTH_SECRET: requiredInProduction(z.string().min(32)),
  /** The canonical origin, e.g. https://catamountsublets.com. */
  APP_URL: z.url().optional(),

  RESEND_API_KEY: requiredInProduction(z.string().min(1)),

  /** Private store for raw uploads; public store for processed media. */
  BLOB_UPLOADS_READ_WRITE_TOKEN: requiredInProduction(z.string().min(1)),
  BLOB_MEDIA_READ_WRITE_TOKEN: requiredInProduction(z.string().min(1)),

  /** Bearer token Vercel Cron sends to /api/cron/*. */
  CRON_SECRET: requiredInProduction(z.string().min(16)),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** The validated environment. Throws with every problem listed on first use. */
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment: ${problems}`);
  }
  cached = parsed.data;
  return cached;
}

export function isProductionEnv(): boolean {
  return isProduction;
}

/** The origin to build absolute URLs on: APP_URL, else Vercel's, else localhost. */
export function appUrl(): string {
  const env = getEnv();
  if (env.APP_URL) return env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
