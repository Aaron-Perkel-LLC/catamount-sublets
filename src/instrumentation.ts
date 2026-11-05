/**
 * Runs once per server instance before it serves anything. Production must
 * have every secret (src/env.ts lists them) and must be able to send mail:
 * without a Resend key the sign-in flow would have nowhere to put codes, and
 * src/server/email/send.ts only prints them outside production. Fail the boot
 * instead of degrading.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { getEnv, isProductionEnv } = await import("./env");
  const { mailMode } = await import("./server/email/send");
  const { log } = await import("./server/log");
  getEnv();
  // Never the value: whether a key is present, and what that means for mail.
  log.info("boot.mail", { env: process.env.VERCEL_ENV ?? "local", resendKey: Boolean(process.env.RESEND_API_KEY), mode: mailMode() });
  if (isProductionEnv() && !process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not set in production; refusing to start");
  }
}
