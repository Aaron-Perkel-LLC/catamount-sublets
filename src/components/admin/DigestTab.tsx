"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { adminDigestOverview, adminDigestRender, adminDigestSendTest, adminSetDigestSwitch } from "@/server/actions/admin";
import type { DigestOverview, DigestRender, PreviewState, SkipReason } from "@/server/services/digest";

const STATE_LABEL: Record<PreviewState, string> = {
  would_send: "Would get one",
  no_matches: "Nothing new: no email",
  sent: "Sent this week",
  empty: "Nothing new this week",
  failed: "Failed this week",
  pending: "Sending (pending)",
};

const SKIP_LABEL: Record<SkipReason, string> = {
  banned: "banned",
  stop_email: "Stop email",
  test_address: "test address",
  no_searches: "no saved searches",
};

/**
 * Admin → Digest: the master switch (off by default; the hourly cron does
 * nothing while it is off), who would get the weekly email if it ran now
 * (counts only, never addresses), one person's email in full on click, and
 * "Send a test to me", which goes only to the signed-in admin.
 */
export function DigestTab() {
  const [overview, setOverview] = useState<DigestOverview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [render, setRender] = useState<DigestRender | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const load = useCallback(() => {
    adminDigestOverview()
      .then((o) => {
        setOverview(o);
        setLoadError(null);
      })
      .catch(() => setLoadError("Couldn't load the digest preview."));
  }, []);
  useEffect(load, [load]);

  const open = (userId: string) =>
    start(async () => {
      setSelected(userId);
      setRender(null);
      setNote(null);
      setRender(await adminDigestRender(userId));
    });

  const flip = (enabled: boolean) =>
    start(async () => {
      setNote(null);
      const r = await adminSetDigestSwitch(enabled);
      setNote(r.ok ? (enabled ? "The digest is on. The cron sends at the next digest hour." : "The digest is off. The cron does nothing.") : r.error);
      load();
    });

  const test = () =>
    selected &&
    start(async () => {
      setNote(null);
      const r = await adminDigestSendTest(selected);
      setNote(r.ok ? `Test sent to ${r.data.to}: ${r.data.total} listing${r.data.total === 1 ? "" : "s"}${r.data.fallback ? " (nothing new for them, so their newest matches from any time)" : ""}.` : r.error);
    });

  if (loadError) return <p className="text-sm text-error-ink">{loadError}</p>;
  if (!overview) return <p className="text-sm text-ink-3">Working out who would get it…</p>;

  const skipped = (Object.entries(overview.skipped) as [SkipReason, number][]).filter(([, n]) => n > 0);
  const would = overview.rows.filter((r) => r.state === "would_send").length;
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 rounded-xl border border-line p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-bold">Weekly digest is {overview.switchOn ? "ON" : "OFF"}</p>
            <p className="text-sm text-ink-2">
              Next digest: {overview.nextDate}, {overview.hour}:00 Eastern (catch-up runs for three hours after). {overview.totals.subscribed} people have it on;{" "}
              {overview.totals.searches} saved searches in all.
            </p>
          </div>
          <button
            type="button"
            className={overview.switchOn ? "btn-secondary" : "btn-primary"}
            disabled={pending || (!overview.switchOn && overview.blockers.length > 0)}
            onClick={() => flip(!overview.switchOn)}
          >
            {overview.switchOn ? "Turn off" : "Turn on"}
          </button>
        </div>
        {overview.blockers.length > 0 && (
          <ul className="list-disc pl-5 text-sm text-error-ink">
            {overview.blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        )}
        {overview.week && (
          <p className="text-sm text-ink-3">
            Week of {overview.week.date}: {overview.week.counts.sent} sent, {overview.week.counts.empty} with nothing new, {overview.week.counts.failed} failed, {overview.week.counts.pending}{" "}
            pending.
          </p>
        )}
        <p role="status" aria-live="polite" className="text-sm text-ink-2 empty:hidden">
          {note}
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="font-bold">If it ran now</h3>
        <p className="text-sm text-ink-2">
          {would} of {overview.rows.length} would get an email.
          {skipped.length > 0 && ` Left out: ${skipped.map(([k, n]) => `${n} ${SKIP_LABEL[k]}`).join(", ")}.`} People are shown by the start of their account id; click one to see their
          email.
        </p>
        {overview.rows.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-left text-sm">
              <thead className="bg-line-light text-ink-2">
                <tr>
                  <th className="px-3 py-2">Account</th>
                  <th className="px-3 py-2">Searches</th>
                  <th className="px-3 py-2">New matches</th>
                  <th className="px-3 py-2">State</th>
                </tr>
              </thead>
              <tbody>
                {overview.rows.map((r) => (
                  <tr key={r.userId} className={`border-t border-line ${selected === r.userId ? "bg-notice-tint" : ""}`}>
                    <td className="px-3 py-2 font-mono">
                      <button type="button" className="link" onClick={() => open(r.userId)}>
                        {r.ref}
                      </button>
                    </td>
                    <td className="px-3 py-2">{r.searches}</td>
                    <td className="px-3 py-2">{r.matches}</td>
                    <td className="px-3 py-2">{STATE_LABEL[r.state]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-bold">
              <span className="font-mono">{selected.slice(0, 8)}</span>&apos;s email
            </h3>
            <button type="button" className="btn-secondary" disabled={pending || !render || render.total === 0} onClick={test}>
              Send a test to me
            </button>
          </div>
          {!render ? (
            <p className="text-sm text-ink-3">Rendering…</p>
          ) : render.total === 0 ? (
            <p className="text-sm text-ink-2">Nothing on the board matches their searches.</p>
          ) : (
            <>
              <p className="text-sm text-ink-2">
                Subject &ldquo;{render.subject}&rdquo;.
                {render.fallback && " Nothing is new for them this week, so this shows their newest matches from any time."} Its unsubscribe links are yours, so a
                test can only turn off your own digest. The test goes to your address only and records nothing.
              </p>
              <iframe title="Digest preview" sandbox="" srcDoc={render.html} className="h-[32rem] w-full rounded-lg border border-line bg-paper" />
              <details className="text-sm">
                <summary className="cursor-pointer text-ink-3">Plain-text version</summary>
                <pre className="mt-1 overflow-x-auto rounded-lg border border-line bg-paper p-3 text-xs whitespace-pre-wrap">{render.text}</pre>
              </details>
            </>
          )}
        </section>
      )}
    </div>
  );
}
