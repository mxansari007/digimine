"use client";

/** Renders an AtsScore: overall, per-dimension bars, keywords, and top fixes. */
import type { AtsScore } from "@digimine/types";

function tone(score: number) {
    if (score >= 80) return { text: "text-emerald-600", bg: "bg-emerald-500", ring: "ring-emerald-500/30", label: "Strong" };
    if (score >= 60) return { text: "text-amber-600", bg: "bg-amber-500", ring: "ring-amber-500/30", label: "Decent" };
    if (score >= 40) return { text: "text-orange-600", bg: "bg-orange-500", ring: "ring-orange-500/30", label: "Needs work" };
    return { text: "text-rose-600", bg: "bg-rose-500", ring: "ring-rose-500/30", label: "Weak" };
}

export default function AtsScorePanel({ score }: { score: AtsScore }) {
    const t = tone(score.overall);
    return (
        <div className="space-y-5">
            {/* Overall */}
            <div className="flex items-center gap-4">
                <div
                    className={`grid h-20 w-20 shrink-0 place-items-center rounded-full ring-8 ${t.ring}`}
                    style={{ boxShadow: "inset 0 0 0 2px rgba(0,0,0,0.04)" }}
                >
                    <div className="text-center leading-none">
                        <div className={`text-2xl font-bold ${t.text}`}>{score.overall}</div>
                        <div className="text-[10px] text-slate-400">/ 100</div>
                    </div>
                </div>
                <div className="min-w-0">
                    <div className={`text-sm font-semibold ${t.text}`}>
                        {t.label} ATS match
                        {score.hasJobDescription ? " (vs. job description)" : ""}
                    </div>
                    <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">{score.summary}</p>
                </div>
            </div>

            {/* Subscores */}
            <div className="space-y-2.5">
                {score.subscores.map((s) => {
                    const st = tone(s.score);
                    return (
                        <div key={s.key}>
                            <div className="flex items-center justify-between text-xs">
                                <span className="font-medium text-slate-700 dark:text-slate-200">{s.label}</span>
                                <span className={`font-semibold ${st.text}`}>{s.score}</span>
                            </div>
                            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                                <div className={`h-full rounded-full ${st.bg}`} style={{ width: `${s.score}%` }} />
                            </div>
                            {s.suggestions.length > 0 && (
                                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-slate-500 dark:text-slate-400">
                                    {s.suggestions.slice(0, 3).map((sug, i) => (
                                        <li key={i}>{sug}</li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Top fixes */}
            {score.topFixes.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-500/10">
                    <div className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                        Top fixes
                    </div>
                    <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-sm text-amber-900 dark:text-amber-100">
                        {score.topFixes.map((f, i) => (
                            <li key={i}>{f}</li>
                        ))}
                    </ol>
                </div>
            )}

            {/* Keywords */}
            {(score.matchedKeywords.length > 0 || score.missingKeywords.length > 0) && (
                <div className="grid gap-3 sm:grid-cols-2">
                    {score.matchedKeywords.length > 0 && (
                        <div>
                            <div className="text-xs font-semibold text-emerald-600">Matched keywords</div>
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                                {score.matchedKeywords.map((k, i) => (
                                    <span
                                        key={i}
                                        className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                                    >
                                        {k}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                    {score.missingKeywords.length > 0 && (
                        <div>
                            <div className="text-xs font-semibold text-rose-600">Missing keywords</div>
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                                {score.missingKeywords.map((k, i) => (
                                    <span
                                        key={i}
                                        className="rounded-full bg-rose-50 px-2 py-0.5 text-xs text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"
                                    >
                                        {k}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
