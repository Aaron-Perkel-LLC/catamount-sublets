"use client";

import { ALSO_BY } from "@/config/site";
import { shortDate } from "@/lib/dates";
import { type ScaleSummary, SURVEY_QUESTIONS, type SurveySummary, type SurveyUsed, type Tally } from "@/lib/survey";
import { BarList } from "./BarList";
import { Card, Empty } from "./Card";
import { type Kpi, KpiRow } from "./KpiCard";
import { Pill } from "./Pill";
import { Tip } from "./Tip";
import { CARD_TITLE, GROUP, LABEL, LINK, num } from "./ui";

/** One answer's free text with the context to read it in; first name only. */
export interface SurveyTextRowDto {
  id: number;
  userId: string;
  firstName: string | null;
  posted: boolean;
  used: SurveyUsed;
  overall: number;
  problems: string;
  missing: string;
  followup: boolean;
  answeredAt: string;
}

export interface SurveyDto {
  invited: number;
  summary: SurveySummary;
  text: SurveyTextRowDto[];
}

const rows = (tallies: Tally[]) => tallies.map((t) => ({ label: t.label, n: t.n, pct: t.pct }));
const scaleRows = (s: ScaleSummary) => s.counts.map((n, i) => ({ label: String(i + 1), n, pct: s.answered ? Math.round((n / s.answered) * 100) : 0 }));
const scaleEnds = (q: { ends: readonly [string, string] }) => `1 ${q.ends[0].toLowerCase()} · 5 ${q.ends[1].toLowerCase()}`;
const average = (s: ScaleSummary) => (s.average === null ? "—" : String(s.average));

/**
 * One question's tally. The question is the card's title, drawn here rather
 * than by Card: a question can wrap to two lines on a phone, and Card's
 * one-line header has no room under a wrapped title. On one line it sits
 * exactly where Card would put it.
 */
function Question({ title, tip, rows }: { title: string; tip: string; rows: { label: string; n: number; pct: number }[] }) {
  return (
    <Card>
      <h2 className={`${CARD_TITLE} self-start`}>
        <Tip text={tip}>{title}</Tip>
      </h2>
      <BarList rows={rows} />
    </Card>
  );
}

/**
 * The feedback survey's results: the headline numbers, a card per question
 * with its tally (what the percentages are of is behind each card's ⓘ), and
 * what people wrote.
 */
export function SurveyTab({ survey }: { survey: SurveyDto }) {
  const { summary: s, invited, text } = survey;
  const rate = Math.round((s.answered / Math.max(1, invited)) * 100);
  const kpis: Kpi[] = [
    {
      key: "answered",
      label: "Answered",
      value: num(s.answered),
      of: `/ ${num(invited)} invited`,
      tip: `${num(s.followup)} of them said it's OK to email them about their answers.`,
    },
    { key: "rate", label: "Response rate", value: invited ? `${rate}%` : "—" },
    { key: "overall", label: "Overall", value: average(s.overall), of: "/ 5", tip: `The average answer to “${SURVEY_QUESTIONS.overall.label}” (${scaleEnds(SURVEY_QUESTIONS.overall)}).` },
    { key: "recommend", label: "Recommend", value: average(s.recommend), of: "/ 5", tip: `The average answer to “${SURVEY_QUESTIONS.recommend.label}” (${scaleEnds(SURVEY_QUESTIONS.recommend)}).` },
  ];
  const written = text.filter((t) => t.problems || t.missing);

  // What each card's percentages are of. The questions about using the site were not put to people who have not used it yet.
  const base = "Percentages are of the people who answered this question.";
  const usage = s.notYet > 0 ? `${base} ${s.notYet} ${s.notYet === 1 ? "person has" : "people have"} not used the site yet and skipped it.` : base;

  return (
    <div className="flex flex-col gap-4">
      <KpiRow kpis={kpis} />

      {s.answered === 0 ? (
        <Card>
          <Empty>No answers yet.</Empty>
        </Card>
      ) : (
        <>
          {/* Not the form's order: paired by length (the two 1-to-5 scales together, the long pick-any list last) so the rows line up. */}
          <div className="grid items-start gap-4 md:grid-cols-2">
            <Question title={SURVEY_QUESTIONS.used.label} tip={base} rows={rows(s.used)} />
            <Question title={SURVEY_QUESTIONS.outcome.label} tip={usage} rows={rows(s.outcome)} />
            <Question title={SURVEY_QUESTIONS.overall.label} tip={`${scaleEnds(SURVEY_QUESTIONS.overall)}. ${base}`} rows={scaleRows(s.overall)} />
            <Question title={SURVEY_QUESTIONS.recommend.label} tip={`${scaleEnds(SURVEY_QUESTIONS.recommend)}. ${base}`} rows={scaleRows(s.recommend)} />
            <Question title={SURVEY_QUESTIONS.signin.label} tip={usage} rows={rows(s.signin)} />
            <Question title={SURVEY_QUESTIONS.vsLegacy.label} tip={usage} rows={rows(s.vsLegacy)} />
            <Question title={SURVEY_QUESTIONS.useful.label} tip={`People could pick any, so these add up to more than 100%. ${usage}`} rows={rows(s.useful)} />
            <Question title={`${ALSO_BY.name}: ${SURVEY_QUESTIONS.lejer.label.toLowerCase()}`} tip={base} rows={rows(s.lejer)} />
          </div>

          <Card flush title="In their words">
            {written.length === 0 ? (
              <div className="px-4">
                <Empty>Nobody has written anything yet.</Empty>
              </div>
            ) : (
              <ul className="divide-y divide-line-light border-t border-line-light">
                {written.map((t) => (
                  <li key={t.id} className="flex flex-col gap-2 px-4 pt-1.5 pb-3 md:pt-3">
                    <div className="flex flex-wrap items-center gap-x-2">
                      <a href={`/admin/people#people:${t.userId}`} className={LINK}>
                        {t.firstName ?? "Someone"}
                      </a>
                      <Pill tone={t.posted ? "info" : "muted"}>{t.posted ? "Posted" : "No post"}</Pill>
                      {t.followup && <Pill tone="good">Follow-up OK</Pill>}
                      <span className={`${LABEL} w-full tabular-nums max-md:-mt-1.5 md:w-auto`}>
                        {SURVEY_QUESTIONS.used.options[t.used]} · overall {t.overall}/5 · {shortDate(new Date(t.answeredAt))}
                      </span>
                    </div>
                    <div className="grid gap-x-6 gap-y-2 md:grid-cols-2">
                      {t.problems && (
                        <div className="flex flex-col gap-1">
                          <span className={GROUP}>Annoying or broken</span>
                          <p className="text-[13px] leading-5 whitespace-pre-line">{t.problems}</p>
                        </div>
                      )}
                      {t.missing && (
                        <div className="flex flex-col gap-1">
                          <span className={GROUP}>Missing</span>
                          <p className="text-[13px] leading-5 whitespace-pre-line">{t.missing}</p>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
