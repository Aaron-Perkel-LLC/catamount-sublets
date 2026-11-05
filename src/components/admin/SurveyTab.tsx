"use client";

import { ALSO_BY } from "@/config/site";
import { shortDate } from "@/lib/dates";
import { type ScaleSummary, SURVEY_QUESTIONS, type SurveySummary, type SurveyUsed, type Tally } from "@/lib/survey";
import { BarList } from "./BarList";

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
const scaleTitle = (q: { label: string; ends: readonly [string, string] }) => `${q.label} (1 ${q.ends[0].toLowerCase()} · 5 ${q.ends[1].toLowerCase()})`;

/** The feedback survey's results: how many answered, every question's tally, and what people wrote. */
export function SurveyTab({ survey }: { survey: SurveyDto }) {
  const { summary: s, invited, text } = survey;
  const rate = invited ? Math.round((s.answered / invited) * 100) : 0;
  const tiles: [string, string | number][] = [
    ["Answered", s.answered],
    ["Invited", invited],
    ["Response rate", `${rate}%`],
    ["Overall, of 5", s.overall.average ?? "–"],
    ["Recommend, of 5", s.recommend.average ?? "–"],
    ["Follow-up OK", s.followup],
  ];
  const written = text.filter((t) => t.problems || t.missing);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map(([label, n]) => (
          <div key={label} className="rounded-lg border border-line bg-paper px-3 py-2">
            <div className="text-xs text-ink-3">{label}</div>
            <div className="text-lg font-bold">{n}</div>
          </div>
        ))}
      </div>

      {s.answered === 0 ? (
        <p className="text-sm text-ink-3">No answers yet.</p>
      ) : (
        <>
          <p className="text-xs text-ink-3">
            Percentages are of the people who answered that question. {s.notYet > 0 && `${s.notYet} ${s.notYet === 1 ? "person has" : "people have"} not used the site yet and skipped the questions about using it.`}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <BarList wide title={SURVEY_QUESTIONS.used.label} rows={rows(s.used)} />
            <BarList wide title={SURVEY_QUESTIONS.outcome.label} rows={rows(s.outcome)} />
            <BarList title={scaleTitle(SURVEY_QUESTIONS.overall)} rows={scaleRows(s.overall)} />
            <BarList wide title={SURVEY_QUESTIONS.useful.label} rows={rows(s.useful)} />
            <BarList wide title={SURVEY_QUESTIONS.signin.label} rows={rows(s.signin)} />
            <BarList wide title={SURVEY_QUESTIONS.vsLegacy.label} rows={rows(s.vsLegacy)} />
            <BarList title={scaleTitle(SURVEY_QUESTIONS.recommend)} rows={scaleRows(s.recommend)} />
            <BarList wide title={`${ALSO_BY.name}: ${SURVEY_QUESTIONS.lejer.label.toLowerCase()}`} rows={rows(s.lejer)} />
          </div>

          <section className="flex flex-col gap-3">
            <h3 className="font-bold">In their words</h3>
            {written.length === 0 ? (
              <p className="text-sm text-ink-3">Nobody has written anything yet.</p>
            ) : (
              written.map((t) => (
                <article key={t.id} className="flex flex-col gap-2 rounded-xl border border-line bg-paper p-4 text-sm">
                  <header className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3">
                    <a href={`#people:${t.userId}`} className="font-bold text-lake">
                      {t.firstName ?? "Someone"}
                    </a>
                    <span className="rounded-full border border-line px-2">{t.posted ? "posted" : "no post"}</span>
                    <span>{SURVEY_QUESTIONS.used.options[t.used]}</span>
                    <span>· overall {t.overall}/5</span>
                    <span>· {shortDate(new Date(t.answeredAt))}</span>
                    {t.followup && <span className="rounded-full bg-included-tint px-2 text-included-ink">follow-up OK</span>}
                  </header>
                  {t.problems && (
                    <p className="whitespace-pre-line">
                      <span className="font-bold text-ink-3">Annoying or broken: </span>
                      {t.problems}
                    </p>
                  )}
                  {t.missing && (
                    <p className="whitespace-pre-line">
                      <span className="font-bold text-ink-3">Missing: </span>
                      {t.missing}
                    </p>
                  )}
                </article>
              ))
            )}
          </section>
        </>
      )}
    </div>
  );
}
