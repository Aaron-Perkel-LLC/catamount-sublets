import { OUTCOMES, type Outcome, type OutcomeSummary } from "@/lib/listing-outcome";
import { BarList } from "./BarList";
import { Card } from "./Card";
import { MUTED, num } from "./ui";

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
    <Card
      id="outcomes"
      title="How listings ended"
      tip={`Posters' answers, all time (the date range doesn't apply). Filled through us is a share of the ${num(answered)} that say how it ended; Still available and Skipped are left out. ${asked === 0 ? "The “still available?” email has not been sent yet (Semesters → Ask posters)." : `By email, ${num(askedAnswered)} of ${num(asked)} asked have said how it ended.`}`}
      actions={
        <span className={MUTED}>
          <span className="text-sm font-bold text-ink tabular-nums">{throughSitePct === null ? "—" : `${throughSitePct}%`}</span> filled through us
        </span>
      }
    >
      <BarList rows={OUTCOME_ORDER.map((o) => ({ label: OUTCOMES[o], n: counts[o] }))} />
    </Card>
  );
}
