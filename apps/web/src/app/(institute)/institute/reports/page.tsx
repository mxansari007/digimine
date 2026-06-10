"use client";

/**
 * Institute → Placement readiness report (the TPO dashboard).
 *
 * Reads /api/institute/{id}/reports and renders it as a printable,
 * document-style report: institute header, headline readiness ledger,
 * per-class table with readiness distribution bars, and the at-risk
 * roster. Exports to CSV; "Print / save PDF" uses the browser's print
 * dialog with print-tuned styles so the same page doubles as NAAC/NBA
 * training-outcome evidence.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card } from "@digimine/ui";
import { Download, Printer, RefreshCw, AlertTriangle } from "lucide-react";
import { useAuthContext } from "@/contexts/AuthContext";
import { teacherFetch } from "@/lib/api/teacherFetch";

type ClassRow = {
    classId: string;
    className: string;
    teacherName: string | null;
    activeStudents: number;
    participated: number;
    participationPercent: number;
    attempts: number;
    averagePercentage: number | null;
    ready: number;
    developing: number;
    atRisk: number;
};

type AtRiskRow = {
    studentId: string;
    studentName: string;
    studentEmail: string;
    className: string;
    averagePercentage: number | null;
    daysSinceLastActive: number | null;
    reasons: string[];
};

type Report = {
    institute: { id: string; name: string };
    generatedAt: string;
    totals: {
        classes: number;
        activeStudents: number;
        participated: number;
        participationPercent: number;
        attempts: number;
        attemptsLast30d: number;
        averagePercentage: number | null;
        ready: number;
        developing: number;
        atRisk: number;
    };
    classes: ClassRow[];
    atRiskStudents: AtRiskRow[];
};

function csvEscape(value: string | number | null): string {
    const s = value === null || value === undefined ? "" : String(value);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function InstituteReportsPage() {
    const { firebaseUser } = useAuthContext();
    const [report, setReport] = useState<Report | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const load = useCallback(async () => {
        if (!firebaseUser) return;
        setLoading(true);
        setError("");
        try {
            const meRes = await teacherFetch(firebaseUser, "/api/institute/me");
            const me = await meRes.json();
            const instituteId = me?.institute?.id;
            if (!instituteId) throw new Error("No institute found for this account.");
            const res = await teacherFetch(
                firebaseUser,
                `/api/institute/${encodeURIComponent(instituteId)}/reports`
            );
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to build report");
            setReport(data as Report);
        } catch (e) {
            setError((e as Error).message || "Failed to build report");
        } finally {
            setLoading(false);
        }
    }, [firebaseUser]);

    useEffect(() => {
        load();
    }, [load]);

    const generatedLabel = useMemo(() => {
        if (!report) return "";
        return new Date(report.generatedAt).toLocaleString("en-IN", {
            day: "2-digit",
            month: "long",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    }, [report]);

    const exportCsv = () => {
        if (!report) return;
        const lines: string[] = [];
        lines.push(`Placement readiness report,${csvEscape(report.institute.name)}`);
        lines.push(`Generated,${csvEscape(generatedLabel)}`);
        lines.push("");
        lines.push(
            [
                "Class", "Teacher", "Active students", "Participated", "Participation %",
                "Attempts", "Average score %", "Placement-ready", "Developing", "At risk",
            ].join(",")
        );
        for (const c of report.classes) {
            lines.push(
                [
                    csvEscape(c.className), csvEscape(c.teacherName || ""), c.activeStudents,
                    c.participated, c.participationPercent, c.attempts,
                    csvEscape(c.averagePercentage), c.ready, c.developing, c.atRisk,
                ].join(",")
            );
        }
        lines.push("");
        lines.push(["At-risk student", "Email", "Class", "Average %", "Inactive (days)", "Flags"].join(","));
        for (const s of report.atRiskStudents) {
            lines.push(
                [
                    csvEscape(s.studentName), csvEscape(s.studentEmail), csvEscape(s.className),
                    csvEscape(s.averagePercentage), csvEscape(s.daysSinceLastActive),
                    csvEscape(s.reasons.join("; ")),
                ].join(",")
            );
        }
        const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `placement-readiness-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-24">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
            </div>
        );
    }

    if (error) {
        return (
            <Card className="p-8 text-center">
                <p className="text-sm text-rose-600">{error}</p>
                <Button variant="outline" size="sm" className="mt-4" onClick={load}>
                    Try again
                </Button>
            </Card>
        );
    }

    if (!report) return null;
    const t = report.totals;

    return (
        <div className="space-y-6 print:space-y-4">
            {/* ── Report header — reads like the cover of an official document ── */}
            <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-slate-900 pb-4 print:border-black">
                <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Placement cell · Training outcomes
                    </p>
                    <h1 className="mt-1 font-display text-2xl font-bold text-slate-900">
                        Placement readiness report
                    </h1>
                    <p className="mt-1 text-sm text-slate-500">
                        {report.institute.name} · Generated {generatedLabel}
                    </p>
                </div>
                <div className="flex gap-2 print:hidden">
                    <Button variant="outline" size="sm" onClick={load}>
                        <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Refresh
                    </Button>
                    <Button variant="outline" size="sm" onClick={exportCsv}>
                        <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Export CSV
                    </Button>
                    <Button variant="primary" size="sm" onClick={() => window.print()}>
                        <Printer className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Print / save PDF
                    </Button>
                </div>
            </div>

            {/* ── Headline readiness ledger — the report's one bold element ── */}
            <Card className="overflow-hidden p-6 print:border print:shadow-none">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <ReadinessLegend ready={t.ready} developing={t.developing} atRisk={t.atRisk} />
                    <dl className="flex flex-wrap gap-x-8 gap-y-2 text-right">
                        <Headline label="Active students" value={t.activeStudents} />
                        <Headline label="Participation" value={`${t.participationPercent}%`} />
                        <Headline
                            label="Average score"
                            value={t.averagePercentage === null ? "—" : `${t.averagePercentage}%`}
                        />
                        <Headline label="Attempts · 30 days" value={t.attemptsLast30d} />
                    </dl>
                </div>
                <div className="mt-4">
                    <DistributionBar
                        ready={t.ready}
                        developing={t.developing}
                        atRisk={t.atRisk}
                        tall
                    />
                </div>
            </Card>

            {/* ── Per-class ledger ── */}
            <Card className="overflow-x-auto p-0 print:border print:shadow-none">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-slate-200 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                            <th className="px-5 py-3">Class</th>
                            <th className="px-3 py-3 text-right">Students</th>
                            <th className="px-3 py-3 text-right">Participation</th>
                            <th className="px-3 py-3 text-right">Avg score</th>
                            <th className="px-3 py-3 text-right">Attempts</th>
                            <th className="w-[26%] px-5 py-3">Readiness distribution</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {report.classes.length === 0 && (
                            <tr>
                                <td colSpan={6} className="px-5 py-10 text-center text-slate-500">
                                    No classes yet. Create classes and enroll students to see
                                    readiness data here.
                                </td>
                            </tr>
                        )}
                        {report.classes.map((c) => (
                            <tr key={c.classId} className="hover:bg-slate-50/60 print:hover:bg-transparent">
                                <td className="px-5 py-3">
                                    <div className="font-medium text-slate-900">{c.className}</div>
                                    {c.teacherName && (
                                        <div className="text-xs text-slate-400">{c.teacherName}</div>
                                    )}
                                </td>
                                <td className="px-3 py-3 text-right tabular-nums">{c.activeStudents}</td>
                                <td className="px-3 py-3 text-right tabular-nums">
                                    {c.participationPercent}%
                                </td>
                                <td className="px-3 py-3 text-right tabular-nums">
                                    {c.averagePercentage === null ? "—" : `${c.averagePercentage}%`}
                                </td>
                                <td className="px-3 py-3 text-right tabular-nums">{c.attempts}</td>
                                <td className="px-5 py-3">
                                    <DistributionBar
                                        ready={c.ready}
                                        developing={c.developing}
                                        atRisk={c.atRisk}
                                    />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </Card>

            {/* ── At-risk roster — who needs intervention before placement season ── */}
            <Card className="p-6 print:border print:shadow-none">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <AlertTriangle className="h-4 w-4 text-rose-500" aria-hidden />
                    Students needing intervention
                    <span className="text-xs font-normal text-slate-400">
                        — lowest scores first
                    </span>
                </h2>
                {report.atRiskStudents.length === 0 ? (
                    <p className="mt-3 text-sm text-slate-500">
                        No at-risk students right now. Distributions update as students attempt
                        assigned tests and quizzes.
                    </p>
                ) : (
                    <div className="mt-3 overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-200 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                                    <th className="py-2 pr-4">Student</th>
                                    <th className="py-2 pr-4">Class</th>
                                    <th className="py-2 pr-4 text-right">Avg score</th>
                                    <th className="py-2 pr-4 text-right">Inactive</th>
                                    <th className="py-2">Flags</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {report.atRiskStudents.map((s) => (
                                    <tr key={s.studentId}>
                                        <td className="py-2.5 pr-4">
                                            <div className="font-medium text-slate-900">{s.studentName}</div>
                                            <div className="text-xs text-slate-400">{s.studentEmail}</div>
                                        </td>
                                        <td className="py-2.5 pr-4 text-slate-600">{s.className}</td>
                                        <td className="py-2.5 pr-4 text-right tabular-nums">
                                            {s.averagePercentage === null ? "—" : `${s.averagePercentage}%`}
                                        </td>
                                        <td className="py-2.5 pr-4 text-right tabular-nums">
                                            {s.daysSinceLastActive === null
                                                ? "never active"
                                                : `${s.daysSinceLastActive}d`}
                                        </td>
                                        <td className="py-2.5 text-xs text-slate-500">
                                            {s.reasons.join(" · ")}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            <p className="text-[11px] text-slate-400 print:text-black">
                Readiness bands combine average score, score trend, recent activity, and syllabus
                coverage. Suitable as supporting evidence for NAAC/NBA training-outcome criteria.
            </p>
        </div>
    );
}

function Headline({ label, value }: { label: string; value: string | number }) {
    return (
        <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {label}
            </dt>
            <dd className="text-xl font-bold tabular-nums text-slate-900">{value}</dd>
        </div>
    );
}

function ReadinessLegend({
    ready,
    developing,
    atRisk,
}: {
    ready: number;
    developing: number;
    atRisk: number;
}) {
    return (
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <LegendItem swatch="bg-emerald-500" label="Placement-ready" count={ready} />
            <LegendItem swatch="bg-amber-400" label="Developing" count={developing} />
            <LegendItem swatch="bg-rose-500" label="At risk" count={atRisk} />
        </div>
    );
}

function LegendItem({ swatch, label, count }: { swatch: string; label: string; count: number }) {
    return (
        <span className="inline-flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-sm ${swatch}`} aria-hidden />
            <span className="text-slate-600">{label}</span>
            <span className="font-semibold tabular-nums text-slate-900">{count}</span>
        </span>
    );
}

/**
 * The report's signature element: a stacked bar encoding the actual
 * readiness split. Width is proportional to real counts — it IS the data.
 */
function DistributionBar({
    ready,
    developing,
    atRisk,
    tall = false,
}: {
    ready: number;
    developing: number;
    atRisk: number;
    tall?: boolean;
}) {
    const total = ready + developing + atRisk;
    const h = tall ? "h-4" : "h-2.5";
    if (total === 0) {
        return <div className={`${h} w-full rounded-full bg-slate-100`} aria-label="No students" />;
    }
    const seg = (n: number) => `${(n / total) * 100}%`;
    return (
        <div
            className={`flex ${h} w-full overflow-hidden rounded-full`}
            role="img"
            aria-label={`${ready} placement-ready, ${developing} developing, ${atRisk} at risk`}
            title={`${ready} ready · ${developing} developing · ${atRisk} at risk`}
        >
            {ready > 0 && <div className="bg-emerald-500" style={{ width: seg(ready) }} />}
            {developing > 0 && <div className="bg-amber-400" style={{ width: seg(developing) }} />}
            {atRisk > 0 && <div className="bg-rose-500" style={{ width: seg(atRisk) }} />}
        </div>
    );
}
