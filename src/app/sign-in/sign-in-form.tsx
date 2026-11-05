"use client";

import { useEffect, useRef, useState } from "react";
import { ALLOWED_EMAIL_DOMAINS, OTP, SITE } from "@/config/site";
import { authClient } from "@/lib/auth-client";
import { checkEmailAllowed, emailRefusalMessage } from "@/lib/auth-allow";

type Step = { kind: "email" } | { kind: "code"; email: string; sentAt: number };

/**
 * Email → six-digit code → signed in. The server is authoritative on who may
 * sign in; the client runs the same rule first so a refused address gets its
 * message without a round trip. Codes can be resent after the cooldown.
 */
export function SignInForm({ next }: { next: string }) {
  const [step, setStep] = useState<Step>({ kind: "email" });
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step.kind !== "code") return;
    codeRef.current?.focus();
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [step]);

  const example = `netid@${ALLOWED_EMAIL_DOMAINS[0]}`;

  async function sendCode(to: string) {
    // Another domain may still be an approved access request, so only the server can refuse it.
    const check = checkEmailAllowed(to);
    if (!check.ok && check.reason !== "domain") {
      setError(emailRefusalMessage(check.reason));
      return false;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await authClient.emailOtp.sendVerificationOtp({ email: check.email, type: "sign-in" });
    setBusy(false);
    if (err) {
      setError(err.message ?? "Couldn't send a code just now. Try again in a moment.");
      return false;
    }
    setStep({ kind: "code", email: check.email, sentAt: Date.now() });
    setCode("");
    return true;
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (step.kind !== "code") return;
    const otp = code.replace(/\D/g, "");
    if (otp.length !== OTP.length) {
      setError(`Enter the ${OTP.length}-digit code from the email.`);
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await authClient.signIn.emailOtp({ email: step.email, otp });
    setBusy(false);
    if (err) {
      setError(err.message ?? "That code didn't work. Check it and try again.");
      return;
    }
    window.location.assign(next);
  }

  if (step.kind === "email") {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void sendCode(email);
        }}
        className="flex flex-col gap-4"
        noValidate
      >
        <h1 className="text-2xl font-bold text-ink">Sign in</h1>
        <p className="text-ink-2">
          We&apos;ll email you a {OTP.length}-digit code. No password, nothing to remember. First time here? We&apos;ll ask your name once you&apos;re in.
        </p>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-bold text-ink">Your {ALLOWED_EMAIL_DOMAINS[0]} email</span>
          <input
            type="email"
            name="email"
            inputMode="email"
            autoComplete="email"
            placeholder={example}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="field"
            required
            autoFocus
          />
          <span className="text-xs text-ink-3">Use your NetID email ({example}), not your first.last alias.</span>
        </label>
        {error && (
          <p role="alert" className="rounded-lg border border-error-line bg-error-tint px-3 py-2 text-sm text-error-ink">
            {error}
          </p>
        )}
        <button type="submit" className="btn-primary" disabled={busy} aria-busy={busy}>
          {busy ? "Sending…" : "Email me a code"}
        </button>
      </form>
    );
  }

  const secondsLeft = Math.max(0, Math.ceil((step.sentAt + OTP.resendCooldownSeconds * 1000 - now) / 1000));

  return (
    <form onSubmit={verify} className="flex flex-col gap-4" noValidate>
      <h1 className="text-2xl font-bold text-ink">Check your email</h1>
      <p className="text-ink-2">
        We sent a code to <strong className="text-ink">{step.email}</strong>. It expires in{" "}
        {Math.round(OTP.expiresInSeconds / 60)} minutes.
      </p>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-bold text-ink">{OTP.length}-digit code</span>
        <input
          ref={codeRef}
          type="text"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={OTP.length + 2}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="field tracking-[0.3em]"
          required
        />
      </label>
      {error && (
        <p role="alert" className="rounded-lg border border-error-line bg-error-tint px-3 py-2 text-sm text-error-ink">
          {error}
        </p>
      )}
      <button type="submit" className="btn-primary" disabled={busy} aria-busy={busy}>
        {busy ? "Checking…" : "Sign in"}
      </button>
      <p className="text-sm text-ink-3">
        Nothing there? Check your Junk folder for a message from {SITE.name}.{" "}
        {secondsLeft > 0 ? (
          <span>You can ask for another code in {secondsLeft}s.</span>
        ) : (
          <button type="button" className="link" disabled={busy} onClick={() => void sendCode(step.email)}>
            Send another code
          </button>
        )}
      </p>
      <button
        type="button"
        className="link self-start text-sm"
        onClick={() => {
          setStep({ kind: "email" });
          setError(null);
        }}
      >
        Use a different address
      </button>
    </form>
  );
}
