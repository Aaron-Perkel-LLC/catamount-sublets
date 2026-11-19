"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { dayLabel } from "@/lib/chart";
import { adminDigestOverview, adminDigestRender, adminDigestSendTest, adminSetDigestSwitch } from "@/server/actions/admin";
import type { DigestOverview, DigestPreviewRow, DigestRender, PreviewState, SkipReason } from "@/server/services/digest";
import { Card, Empty } from "./Card";
import { type Column, DataTable, Num } from "./DataTable";
import { KpiRow } from "./KpiCard";
import { Pill, type PillTone } from "./Pill";
import { type StatGroup, StatList } from "./StatList";
import { Tip } from "./Tip";
import { BTN, BTN_PRIMARY, CARD, CARD_TITLE, LABEL, LINK, MUTED, num } from "./ui";

const STATE_LABEL: Record<PreviewState, string> = {
  would_send: "Would get one",
  no_matches: "Nothing new: no email",
  sent: "Sent this week",
  empty: "Nothing new this week",
  failed: "Failed this week",
  pending: "Sending (pending)",
};

const STATE_TONE: Record<PreviewState, PillTone> = { would_send: "good", no_matches: "muted", sent: "info", empty: "muted", failed: "bad", pending: "warn" };

const SKIP_LABEL: Record<SkipReason, string> = {
  banned: "Banned",
  stop_email: "Stop email",
  test_address: "Test address",
  no_searches: "No saved searches",
};

/**
 * Admin → Digest: the master switch (off by default; the hourly cron does
 * nothing while it is off) with its state as a pill, the headline numbers,
 * who would get the weekly email if it ran now (counts only, never
 * addresses) beside the coming week's sends and who is left out, and one
 * person's email in full on click with "Send a test to me", which goes only
 * to the signed-in admin.
 */
export function DigestTab() {
  const [overview, setOverview] = useState<DigestOverview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [render, setRender] = useState<DigestRender | null>(null);
  // What the last action said, shown in the card whose button was pressed.
  const [note, setNote] = useState<{ at: "switch" | "test"; text: string } | null>(null);
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
      setNote({ at: "switch", text: r.ok ? (enabled ? "The digest is on. The cron sends at the next digest hour." : "The digest is off. The cron does nothing.") : r.error });
      load();
    });

  const test = () =>
    selected &&
    start(async () => {
      setNote(null);
      const r = await adminDigestSendTest(selected);
      setNote({ at: "test", text: r.ok ? `Test sent to ${r.data.to}: ${r.data.total} listing${r.data.total === 1 ? "" : "s"}${r.data.fallback ? " (nothing new for them, so their newest matches from any time)" : ""}.` : r.error });
    });

  if (loadError)
    return (
      <Card title="Weekly digest">
        <p className="text-[13px] text-error-ink">{loadError}</p>
      </Card>
    );
  if (!overview)
    return (
      <Card title="Weekly digest">
        <Empty>Working out who would get it…</Empty>
      </Card>
    );

  const would = overview.rows.filter((r) => r.state === "would_send").length;
  const groups: StatGroup[] = [];
  if (overview.week) {
    const c = overview.week.counts;
    groups.push({
      title: `Week of ${dayLabel(overview.week.date)}`,
      stats: [
        { label: "Sent", value: num(c.sent), zero: c.sent === 0 },
        { label: "Nothing new", value: num(c.empty), zero: c.empty === 0, tip: "Nothing new matched their searches, so no email went." },
        { label: "Failed", value: num(c.failed), zero: c.failed === 0 },
        { label: "Pending", value: num(c.pending), zero: c.pending === 0 },
      ],
    });
  }
  const skipped = (Object.entries(overview.skipped) as [SkipReason, number][]).filter(([, n]) => n > 0);
  if (skipped.length > 0) groups.push({ title: "Left out", stats: skipped.map(([k, n]) => ({ label: SKIP_LABEL[k], value: num(n) })) });

  const columns: Column<DigestPreviewRow>[] = [
    {
      key: "ref",
      header: "Account",
      primary: true,
      cell: (r) => (
        <button type="button" className={`${LINK} font-mono`} onClick={() => open(r.userId)}>
          {r.ref}
        </button>
      ),
    },
    { key: "searches", header: "Searches", numeric: true, cell: (r) => <Num n={r.searches} /> },
    { key: "matches", header: "New matches", numeric: true, cell: (r) => <Num n={r.matches} /> },
    { key: "state", header: "State", cell: (r) => <Pill tone={STATE_TONE[r.state]}>{STATE_LABEL[r.state]}</Pill> },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Built from the card's parts, not Card: with nothing blocking and nothing to say it is one row, which Card would pad as if a body followed. */}
      <section className={`${CARD} flex flex-col px-4 py-1`} aria-labelledby="digest-switch-h">
        <div className="flex min-h-12 items-center justify-between gap-3">
          <h2 id="digest-switch-h" className={CARD_TITLE}>
            <Tip text="The saved-search email. While the switch is off the hourly cron does nothing.">Weekly digest</Tip>
          </h2>
          <div className="flex shrink-0 items-center gap-2">
            <Pill tone={overview.switchOn ? "good" : "muted"}>{overview.switchOn ? "On" : "Off"}</Pill>
            <button type="button" className={overview.switchOn ? BTN : BTN_PRIMARY} disabled={pending || (!overview.switchOn && overview.blockers.length > 0)} onClick={() => flip(!overview.switchOn)}>
              {overview.switchOn ? "Turn off" : "Turn on"}
            </button>
          </div>
        </div>
        {overview.blockers.length > 0 && (
          <ul className="flex flex-col gap-1 pb-3 text-[13px] text-error-ink">
            {overview.blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        )}
        <p role="status" aria-live="polite" className={`${MUTED} pb-3 empty:hidden`}>
          {note?.at === "switch" ? note.text : null}
        </p>
      </section>

      <KpiRow
        kpis={[
          { key: "next", label: "Next digest", value: dayLabel(overview.nextDate), of: `${overview.hour}:00 ET`, tip: "The next digest morning, Eastern. Catch-up runs for three hours after." },
          { key: "subscribed", label: "Have it on", value: num(overview.totals.subscribed), tip: "People with the weekly email turned on." },
          { key: "searches", label: "Saved searches", value: num(overview.totals.searches), tip: "Saved searches in all, across everyone." },
          { key: "would", label: "Would get one now", value: num(would), of: `/ ${num(overview.rows.length)}`, tip: "If it ran now: people with something new, of those it would consider. The people left out are counted apart." },
        ]}
      />

      <div className={`grid items-start gap-4 ${groups.length > 0 ? "lg:grid-cols-[minmax(0,1fr)_17rem]" : ""}`}>
        <Card flush title="If it ran now" tip="Who would get the weekly email if it ran now. People are shown by the start of their account id, never an address; pick one to see their email. Someone already handled for the coming week shows that instead.">
          <DataTable label="Who would get the digest if it ran now" columns={columns} rows={overview.rows} rowKey={(r) => r.userId} empty="Nobody to send to." rowProps={(r) => ({ className: selected === r.userId ? "bg-notice-tint" : undefined })} />
        </Card>
        {groups.length > 0 && (
          <section className={`${CARD} py-2`} aria-label="This week's sends and who is left out">
            <StatList groups={groups} />
          </section>
        )}
      </div>

      {selected && (
        <Card
          title={`${selected.slice(0, 8)}’s email`}
          actions={
            <button type="button" className={BTN} disabled={pending || !render || render.total === 0} onClick={test}>
              Send a test to me
            </button>
          }
        >
          {!render ? (
            <Empty>Rendering…</Empty>
          ) : render.total === 0 ? (
            <Empty>Nothing on the board matches their searches.</Empty>
          ) : (
            <>
              <p className="text-[13px] text-ink">
                <span className={LABEL}>Subject</span> {render.subject}
              </p>
              <p className={MUTED}>
                {render.fallback && "Nothing is new for them this week, so this shows their newest matches from any time. "}
                Its unsubscribe links are yours, so a test can only turn off your own digest. The test goes to your address only and records nothing.
              </p>
              <iframe title="Digest preview" sandbox="" srcDoc={render.html} className="h-[32rem] w-full rounded-lg border border-line bg-paper" />
              <details>
                <summary className={`${LINK} cursor-pointer`}>Plain-text version</summary>
                <pre className="mt-1 overflow-x-auto rounded-lg border border-line bg-paper p-3 text-xs whitespace-pre-wrap">{render.text}</pre>
              </details>
            </>
          )}
          <p role="status" aria-live="polite" className={`${MUTED} empty:hidden`}>
            {note?.at === "test" ? note.text : null}
          </p>
        </Card>
      )}
    </div>
  );
}
