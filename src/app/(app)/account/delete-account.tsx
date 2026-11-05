"use client";

import { useState, useTransition } from "react";
import { deleteMyAccount } from "@/server/actions/account";

export function DeleteAccount({ email }: { email: string }) {
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-3 rounded-xl border border-error-line bg-error-tint/40 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await deleteMyAccount(typed.trim().toLowerCase());
          if (r && !r.ok) setError(r.error ?? "Couldn’t delete the account.");
        });
      }}
    >
      <h2 className="font-bold text-error-ink">Delete my account and listing</h2>
      <p className="text-sm text-ink-2">Everything goes: your listing, its photos, and your account. This cannot be undone. Type your email address to confirm.</p>
      <input type="text" className="field" placeholder={email} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
      {error && <p className="text-sm text-error-ink">{error}</p>}
      <button type="submit" disabled={pending || typed.trim().toLowerCase() !== email} className="self-start rounded-lg bg-error-ink px-4 py-2.5 font-bold text-paper disabled:opacity-50">
        {pending ? "Deleting…" : "Delete everything"}
      </button>
    </form>
  );
}
