import { OUTCOMES, type Outcome, type OutcomeSummary } from "@/lib/listing-outcome";

const OUTCOME_ORDER: Outcome[] = ["through_site", "elsewhere", "not_filled", "still_available", "skipped"];

/**
 * How listings ended, from the posters' own answers (on delete and from the
 * "still available?" email), over all time: the date range does not apply,
 * because answers outlive their listings. "Filled through us" is a share of
 * the answers that say how it ended, so Still available and Skipped are left
 * out of it.
 */
export function OutcomesCard({ outcomes }: { outcomes: OutcomeSummary }) {
  const { counts, answered, throughSitePct, asked, askedAnswered } = outcomes;
  return (
    <section aria-labelledby="outcomes-heading" className="flex flex-col gap-3 rounded-xl border border-line bg-paper p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 id="outcomes-heading" className="text-sm">
          <span className="font-bold">How listings ended</span> <span className="text-ink-3">· posters&apos; answers, all time</span>
        </h3>
        <p className="text-sm">
          <span className="text-lg font-bold">{throughSitePct === null ? "—" : `${throughSitePct}%`}</span>{" "}
          <span className="text-ink-3">filled through us, of {answered} answered</span>
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {OUTCOME_ORDER.map((o) => (
          <div key={o} className="rounded-lg border border-line-light px-3 py-2">
            <dt className="text-xs text-ink-3">{OUTCOMES[o]}</dt>
            <dd className="text-lg font-bold tabular-nums">{counts[o]}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-ink-3">
        {asked === 0 ? "The “still available?” email has not been sent yet (Semesters → Ask posters)." : `Email: ${askedAnswered} of ${asked} asked have said how it ended.`}
      </p>
    </section>
  );
}
