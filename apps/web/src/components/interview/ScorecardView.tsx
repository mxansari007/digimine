/**
 * Behaviour scorecard renderer — the post-interview debrief body: code
 * correctness, the skill-profile radar with weighted dimension bars, the
 * coach's note, and strengths/improvements. Shared by the results page
 * (which hosts the readiness ring in its hero and passes
 * `showReadiness={false}`) and any standalone summary.
 */
import { Card, Badge } from "@digimine/ui";
import {
    CheckCircle2,
    MoveUpRight,
    Quote,
    MicOff,
    FlaskConical,
} from "lucide-react";
import {
    BEHAVIOUR_DIMENSIONS,
    CORRECTNESS_WEIGHT,
    type BehaviourScorecard,
    type SubmissionVerdict,
} from "@digimine/types";
import { ReadinessRing } from "./ReadinessRing";
import { SkillRadar } from "./SkillRadar";

const WEAK_AT = 50;

function barColor(v: number): string {
    if (v >= 75) return "bg-primary-500";
    if (v >= 50) return "bg-accent-500";
    return "bg-danger-500";
}

function verdictBadge(verdict: SubmissionVerdict | null) {
    if (!verdict) return <Badge variant="outline" size="sm">No code run</Badge>;
    if (verdict === "accepted")
        return <Badge variant="success" size="sm">Accepted</Badge>;
    return (
        <Badge variant="warning" size="sm">
            {verdict.replace(/_/g, " ")}
        </Badge>
    );
}

export function ScorecardView({
    scorecard,
    showReadiness = true,
}: {
    scorecard: BehaviourScorecard;
    showReadiness?: boolean;
}) {
    // DSA/SQL interviews run a judge (totalCount > 0); conversational
    // interviews score "answer accuracy" from the LLM instead.
    const isCode = scorecard.totalCount > 0;
    const weakKeys = BEHAVIOUR_DIMENSIONS.filter(
        (d) => (scorecard.dimensions[d.key] ?? 0) < WEAK_AT
    ).map((d) => d.key as string);

    return (
        <div className="space-y-6">
            {showReadiness && (
                <Card padding="lg" elevated className="flex flex-col items-center justify-center">
                    <ReadinessRing value={scorecard.readiness} label="Interview readiness" />
                </Card>
            )}

            {/* Skill profile — correctness header, then radar + weighted bars */}
            <Card padding="lg" elevated>
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <p className="text-sm font-semibold text-slate-500">
                            {isCode ? "Code correctness" : "Answer accuracy"}
                        </p>
                        <div className="flex items-baseline gap-3">
                            <p className="stat-number">{scorecard.correctness}%</p>
                            {isCode && verdictBadge(scorecard.verdict)}
                        </div>
                        {isCode && (
                            <div className="mt-2 flex items-center gap-2">
                                <FlaskConical className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                                <div className="h-1.5 w-36 overflow-hidden rounded-full bg-slate-100">
                                    <div
                                        className={`h-full rounded-full ${barColor(
                                            scorecard.totalCount
                                                ? (scorecard.passedCount / scorecard.totalCount) * 100
                                                : 0
                                        )}`}
                                        style={{
                                            width: `${scorecard.totalCount ? (scorecard.passedCount / scorecard.totalCount) * 100 : 0}%`,
                                        }}
                                    />
                                </div>
                                <p className="text-xs tabular-nums text-slate-500">
                                    {scorecard.passedCount}/{scorecard.totalCount} tests
                                </p>
                            </div>
                        )}
                    </div>
                    <div
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 py-2"
                        title="Filler words ('um', 'like', 'basically'…) counted across your answers"
                    >
                        <MicOff className="h-4 w-4 text-slate-400" aria-hidden />
                        <div>
                            <p className="text-[11px] font-medium text-slate-500">Filler words</p>
                            <p className="text-sm font-bold tabular-nums text-slate-800">{scorecard.fillerWords}</p>
                        </div>
                    </div>
                </div>

                <div className="mt-6 grid grid-cols-1 items-center gap-6 border-t border-slate-100 pt-5 sm:grid-cols-2">
                    <div className="order-2 sm:order-1">
                        <SkillRadar
                            weak={weakKeys}
                            axes={[
                                ...BEHAVIOUR_DIMENSIONS.map((d) => ({
                                    key: d.key as string,
                                    label: d.label,
                                    value: scorecard.dimensions[d.key] ?? 0,
                                })),
                                { key: "correctness", label: "Correctness / accuracy", value: scorecard.correctness },
                            ]}
                        />
                    </div>
                    <div className="order-1 space-y-3.5 sm:order-2">
                        {BEHAVIOUR_DIMENSIONS.map((d) => {
                            const v = scorecard.dimensions[d.key] ?? 0;
                            const weak = v < WEAK_AT;
                            return (
                                <div key={d.key}>
                                    <div className="flex items-baseline justify-between gap-2 text-sm">
                                        <span className="font-medium text-slate-700">{d.label}</span>
                                        <span
                                            className={`font-bold tabular-nums ${weak ? "text-danger-600" : "text-slate-700"}`}
                                        >
                                            {v}
                                        </span>
                                    </div>
                                    <p className="text-[11px] leading-snug text-slate-400">{d.blurb}</p>
                                    <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                                        <div
                                            className={`h-full rounded-full ${barColor(v)}`}
                                            style={{ width: `${v}%`, transition: "width 0.6s ease" }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                        <p className="pt-1 text-[11px] text-slate-400">
                            Readiness blends these with {isCode ? "correctness" : "accuracy"} (weighted{" "}
                            {Math.round(CORRECTNESS_WEIGHT * 100)}%).
                        </p>
                    </div>
                </div>
            </Card>

            {scorecard.notes && (
                <Card intent="primary" padding="lg">
                    <div className="flex gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300">
                            <Quote className="h-4 w-4" aria-hidden />
                        </span>
                        <div>
                            <p className="mb-1 text-sm font-semibold text-primary-800 dark:text-primary-300">
                                Coach&apos;s note
                            </p>
                            <p className="text-sm leading-relaxed text-slate-700">{scorecard.notes}</p>
                        </div>
                    </div>
                </Card>
            )}

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <Card intent="success" padding="lg">
                    <p className="mb-3 text-sm font-semibold text-success-800 dark:text-success-300">
                        What went well
                    </p>
                    {scorecard.strengths.length > 0 ? (
                        <ul className="space-y-2.5 text-sm text-slate-700">
                            {scorecard.strengths.map((s, i) => (
                                <li key={i} className="flex gap-2.5">
                                    <CheckCircle2
                                        className="mt-0.5 h-4 w-4 shrink-0 text-success-600 dark:text-success-400"
                                        aria-hidden
                                    />
                                    <span>{s}</span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-sm text-slate-500">—</p>
                    )}
                </Card>
                <Card intent="warning" padding="lg">
                    <p className="mb-3 text-sm font-semibold text-warning-800 dark:text-warning-300">
                        Work on this next
                    </p>
                    {scorecard.improvements.length > 0 ? (
                        <ul className="space-y-2.5 text-sm text-slate-700">
                            {scorecard.improvements.map((s, i) => (
                                <li key={i} className="flex gap-2.5">
                                    <MoveUpRight
                                        className="mt-0.5 h-4 w-4 shrink-0 text-warning-600 dark:text-warning-400"
                                        aria-hidden
                                    />
                                    <span>{s}</span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-sm text-slate-500">—</p>
                    )}
                </Card>
            </div>
        </div>
    );
}
