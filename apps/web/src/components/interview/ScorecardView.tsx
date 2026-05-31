/**
 * Behaviour scorecard renderer — readiness, code correctness, per-dimension
 * bars, filler-word count, and coaching strengths/improvements. Shared by the
 * results page and the end-of-interview summary.
 */
import { Card, Badge } from "@digimine/ui";
import {
    BEHAVIOUR_DIMENSIONS,
    type BehaviourScorecard,
    type SubmissionVerdict,
} from "@digimine/types";
import { ReadinessRing } from "./ReadinessRing";
import { SkillRadar } from "./SkillRadar";

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

export function ScorecardView({ scorecard }: { scorecard: BehaviourScorecard }) {
    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card padding="lg" elevated className="flex flex-col items-center justify-center">
                    <ReadinessRing value={scorecard.readiness} label="Interview readiness" />
                </Card>
                <Card padding="lg" elevated className="md:col-span-2">
                    {(() => {
                        // DSA interviews run a judge (totalCount > 0); conversational
                        // interviews score "answer accuracy" from the LLM instead.
                        const isCode = scorecard.totalCount > 0;
                        return (
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-semibold text-slate-500">
                                        {isCode ? "Code correctness" : "Answer accuracy"}
                                    </p>
                                    <p className="stat-number">{scorecard.correctness}%</p>
                                    {isCode && (
                                        <p className="text-xs text-slate-500 mt-1">
                                            {scorecard.passedCount}/{scorecard.totalCount} tests passed
                                        </p>
                                    )}
                                </div>
                                <div className="text-right space-y-2">
                                    {isCode && verdictBadge(scorecard.verdict)}
                                    <p className="text-xs text-slate-500">
                                        Filler words: <span className="font-semibold">{scorecard.fillerWords}</span>
                                    </p>
                                </div>
                            </div>
                        );
                    })()}
                    <div className="mt-5 grid grid-cols-1 items-center gap-5 sm:grid-cols-2">
                        <div className="order-2 sm:order-1">
                            <SkillRadar
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
                        <div className="order-1 space-y-3 sm:order-2">
                            {BEHAVIOUR_DIMENSIONS.map((d) => {
                                const v = scorecard.dimensions[d.key] ?? 0;
                                return (
                                    <div key={d.key}>
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="font-medium text-slate-700">{d.label}</span>
                                            <span className="font-bold tabular-nums text-slate-700">{v}</span>
                                        </div>
                                        <div className="mt-1 h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                                            <div
                                                className={`h-full rounded-full ${barColor(v)}`}
                                                style={{ width: `${v}%`, transition: "width 0.6s ease" }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </Card>
            </div>

            {scorecard.notes && (
                <Card intent="primary" padding="lg">
                    <p className="text-sm font-semibold text-primary-800 mb-1">Coach&apos;s summary</p>
                    <p className="text-sm text-slate-700">{scorecard.notes}</p>
                </Card>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card intent="success" padding="lg">
                    <p className="text-sm font-semibold text-success-800 mb-2">What went well</p>
                    {scorecard.strengths.length > 0 ? (
                        <ul className="space-y-1.5 text-sm text-slate-700 list-disc pl-5">
                            {scorecard.strengths.map((s, i) => (
                                <li key={i}>{s}</li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-sm text-slate-500">—</p>
                    )}
                </Card>
                <Card intent="warning" padding="lg">
                    <p className="text-sm font-semibold text-warning-800 mb-2">Work on this next</p>
                    {scorecard.improvements.length > 0 ? (
                        <ul className="space-y-1.5 text-sm text-slate-700 list-disc pl-5">
                            {scorecard.improvements.map((s, i) => (
                                <li key={i}>{s}</li>
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
