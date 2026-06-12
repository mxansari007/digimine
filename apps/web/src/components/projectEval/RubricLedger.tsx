"use client";

/**
 * The rubric ledger — the signature element of the project-eval report.
 * Each teacher parameter renders as a marksheet row: a colored verdict
 * spine, the parameter name in the display face, a tabular score
 * fraction with a hairline meter, the model's reasoning as quiet body
 * text, and the file evidence set in mono with a citation gutter —
 * because the cited files are the proof behind the score.
 */
import type { ReactNode } from "react";
import { Meter, VerdictBadge, type SubmissionRow } from "./shared";

type ScoreEntry = NonNullable<SubmissionRow["scores"]>[number];

const SPINE: Record<ScoreEntry["verdict"], string> = {
    met: "bg-success-500",
    partial: "bg-warning-500",
    not_met: "bg-danger-500",
};

export function RubricLedger({
    scores,
    adjustedScores,
    renderScoreControl,
}: {
    scores: ScoreEntry[];
    /** Teacher overrides to display next to the AI score (read-only views). */
    adjustedScores?: Record<string, number>;
    /** Teacher report passes an input renderer; student views omit it. */
    renderScoreControl?: (s: ScoreEntry) => ReactNode;
}) {
    return (
        <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-surface shadow-soft-sm">
            {scores.map((s, i) => {
                const override = adjustedScores?.[s.parameterId];
                const effective = override ?? s.score;
                return (
                    <div
                        key={s.parameterId}
                        className={`relative flex gap-4 py-4 pl-5 pr-4 sm:gap-5 ${
                            i > 0 ? "border-t border-slate-100 dark:border-slate-800" : ""
                        }`}
                    >
                        {/* Verdict spine */}
                        <span
                            className={`absolute left-0 top-0 h-full w-1 ${SPINE[s.verdict] ?? SPINE.partial}`}
                            aria-hidden
                        />

                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                                <h3 className="font-display text-[15px] font-semibold text-gray-900">
                                    {s.title}
                                </h3>
                                <VerdictBadge verdict={s.verdict} />
                                {s.confidence !== "high" && (
                                    <span className="text-[11px] text-slate-400">
                                        {s.confidence} confidence — worth a manual look
                                    </span>
                                )}
                            </div>

                            <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                                {s.reasoning}
                            </p>

                            {s.evidence.length > 0 && (
                                <ul className="mt-2.5 space-y-1 border-l-2 border-slate-200 dark:border-slate-700 pl-3">
                                    {s.evidence.map((e, j) => (
                                        <li
                                            key={j}
                                            className="font-mono text-[11px] leading-relaxed text-slate-500 dark:text-slate-400"
                                        >
                                            {e}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        {/* Score column */}
                        <div className="flex w-28 shrink-0 flex-col items-end gap-1.5 sm:w-36">
                            <div className="text-right">
                                <span className="text-xl font-bold tabular-nums text-gray-900">
                                    {effective}
                                </span>
                                <span className="font-mono text-xs text-slate-400">/{s.maxScore}</span>
                                {override !== undefined && override !== s.score && (
                                    <div className="text-[11px] text-slate-400">
                                        AI suggested <span className="tabular-nums">{s.score}</span>
                                    </div>
                                )}
                            </div>
                            <Meter value={effective} max={s.maxScore} className="w-full" />
                            {renderScoreControl && (
                                <div className="mt-1 w-full">{renderScoreControl(s)}</div>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
