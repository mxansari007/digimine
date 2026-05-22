"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Card } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { teacherFetch } from "@/lib/api/teacherFetch";

type Roster = { studentId: string; studentName: string; studentEmail: string };

type Side = {
    profile: { studentId: string; studentName: string; studentEmail: string; rollNumber: string | null };
    stats: {
        completedAttempts: number;
        averagePercentage: number | null;
        bestPercentage: number | null;
        coveragePercent: number;
        daysSinceLastActive: number | null;
        avgDurationSeconds: number;
    };
    risk: {
        score: number;
        band: "low" | "medium" | "high";
        reasons: string[];
    };
};

type Comparison = {
    a: Side;
    b: Side;
    topics: Array<{ category: string; aPercentage: number | null; bPercentage: number | null; aAttempts: number; bAttempts: number }>;
    commonContent: Array<{ contentId: string; contentTitle: string; aPercentage: number; bPercentage: number; aDurationSeconds: number; bDurationSeconds: number }>;
};

function formatPct(n: number | null | undefined) {
    return n === null || n === undefined ? "-" : `${n}%`;
}

function formatDuration(sec: number | null | undefined) {
    if (!sec) return "-";
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    if (m === 0) return `${s}s`;
    return `${m}m ${s.toString().padStart(2, "0")}s`;
}

const riskBg: Record<string, string> = {
    low: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
    medium: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
    high: "bg-red-50 text-red-700 ring-1 ring-red-200",
};

function StatColumn({
    label,
    value,
    helper,
    delta,
}: {
    label: string;
    value: string;
    helper?: string;
    delta?: { value: number; positiveIsGood: boolean } | null;
}) {
    return (
        <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">{label}</p>
            <div className="mt-1 flex items-baseline gap-2">
                <p className="text-2xl font-bold text-gray-900">{value}</p>
                {delta && delta.value !== 0 && (
                    <span
                        className={`text-xs font-semibold ${
                            (delta.value > 0) === delta.positiveIsGood ? "text-emerald-600" : "text-rose-600"
                        }`}
                    >
                        {delta.value > 0 ? "+" : ""}
                        {delta.value}
                    </span>
                )}
            </div>
            {helper && <p className="text-[10px] text-gray-400">{helper}</p>}
        </div>
    );
}

export default function CompareStudentsPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { firebaseUser } = useAuthContext();
    const [roster, setRoster] = useState<Roster[]>([]);
    const [a, setA] = useState<string>(searchParams.get("a") || "");
    const [b, setB] = useState<string>(searchParams.get("b") || "");
    const [data, setData] = useState<Comparison | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    // Load roster (all students across all classes the teacher owns)
    useEffect(() => {
        if (!firebaseUser) return;
        (async () => {
            try {
                const res = await fetch(
                    `/api/teacher/students/progress?teacherId=${encodeURIComponent(firebaseUser.uid)}`,
                    { headers: { Authorization: `Bearer ${await firebaseUser.getIdToken()}` } }
                );
                const json = await res.json();
                if (res.ok) {
                    setRoster(
                        (json.students || []).map((s: any) => ({
                            studentId: s.studentId || s.id,
                            studentName: s.studentName || s.studentEmail || "Student",
                            studentEmail: s.studentEmail || "",
                        }))
                    );
                }
            } catch {
                /* roster fetch is non-critical */
            }
        })();
    }, [firebaseUser]);

    const fetchCompare = useCallback(async () => {
        if (!firebaseUser || !a || !b) return;
        setLoading(true);
        setError("");
        try {
            const res = await teacherFetch(
                firebaseUser,
                `/api/teacher/students/compare?teacherId=${encodeURIComponent(firebaseUser.uid)}&a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`
            );
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || "Failed to compare");
            setData(json);
            const params = new URLSearchParams();
            params.set("a", a);
            params.set("b", b);
            router.replace(`/teacher/students/compare?${params.toString()}`);
        } catch (err: any) {
            setError(err.message || "Failed to compare");
            setData(null);
        } finally {
            setLoading(false);
        }
    }, [a, b, firebaseUser, router]);

    useEffect(() => {
        if (a && b && a !== b) fetchCompare();
    }, [a, b, fetchCompare]);

    const options = useMemo(() => roster.sort((x, y) => x.studentName.localeCompare(y.studentName)), [roster]);

    return (
        <div className="space-y-6">
            <div>
                <Link href="/teacher/students" className="text-sm text-primary-700 hover:text-primary-800">
                    ← Back to students
                </Link>
                <h1 className="mt-1 text-2xl font-bold text-gray-900">Compare students</h1>
                <p className="text-sm text-gray-500">Pick two students to compare side-by-side.</p>
            </div>

            <Card className="p-6 grid gap-4 md:grid-cols-[1fr_1fr_auto]">
                <div>
                    <label className="text-xs font-medium uppercase tracking-wide text-gray-500">Student A</label>
                    <select
                        value={a}
                        onChange={(e) => setA(e.target.value)}
                        className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    >
                        <option value="">Choose…</option>
                        {options.map((s) => (
                            <option key={s.studentId} value={s.studentId} disabled={s.studentId === b}>
                                {s.studentName} {s.studentEmail ? `· ${s.studentEmail}` : ""}
                            </option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="text-xs font-medium uppercase tracking-wide text-gray-500">Student B</label>
                    <select
                        value={b}
                        onChange={(e) => setB(e.target.value)}
                        className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    >
                        <option value="">Choose…</option>
                        {options.map((s) => (
                            <option key={s.studentId} value={s.studentId} disabled={s.studentId === a}>
                                {s.studentName} {s.studentEmail ? `· ${s.studentEmail}` : ""}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="flex items-end">
                    <Button variant="primary" onClick={fetchCompare} disabled={!a || !b || a === b} isLoading={loading}>
                        Compare
                    </Button>
                </div>
            </Card>

            {error && <Card className="p-4 text-sm text-red-700 border-red-200 bg-red-50">{error}</Card>}

            {data && (
                <>
                    <div className="grid gap-4 lg:grid-cols-2">
                        {[data.a, data.b].map((side, idx) => (
                            <Card key={side.profile.studentId} className="p-6">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                                            {idx === 0 ? "Student A" : "Student B"}
                                        </p>
                                        <Link
                                            href={`/teacher/students/${side.profile.studentId}`}
                                            className="text-lg font-bold text-gray-900 hover:text-primary-700"
                                        >
                                            {side.profile.studentName}
                                        </Link>
                                        <p className="text-xs text-gray-500">{side.profile.studentEmail}</p>
                                    </div>
                                    <span
                                        className={`inline-flex items-center gap-2 rounded-full px-2.5 py-0.5 text-xs font-semibold ${riskBg[side.risk.band]}`}
                                    >
                                        Risk {side.risk.score}
                                    </span>
                                </div>

                                <div className="mt-5 grid grid-cols-2 gap-3">
                                    <StatColumn
                                        label="Avg score"
                                        value={formatPct(side.stats.averagePercentage)}
                                        delta={
                                            idx === 0
                                                ? null
                                                : {
                                                      value:
                                                          (data.b.stats.averagePercentage ?? 0) -
                                                          (data.a.stats.averagePercentage ?? 0),
                                                      positiveIsGood: true,
                                                  }
                                        }
                                    />
                                    <StatColumn label="Best" value={formatPct(side.stats.bestPercentage)} />
                                    <StatColumn label="Attempts" value={String(side.stats.completedAttempts)} />
                                    <StatColumn label="Coverage" value={`${side.stats.coveragePercent}%`} />
                                    <StatColumn label="Avg time" value={formatDuration(side.stats.avgDurationSeconds)} />
                                    <StatColumn
                                        label="Inactive for"
                                        value={
                                            side.stats.daysSinceLastActive === null
                                                ? "never seen"
                                                : `${side.stats.daysSinceLastActive}d`
                                        }
                                    />
                                </div>

                                {side.risk.reasons.length > 0 && (
                                    <ul className="mt-4 space-y-1 text-xs text-gray-600">
                                        {side.risk.reasons.map((r) => (
                                            <li key={r}>• {r}</li>
                                        ))}
                                    </ul>
                                )}
                            </Card>
                        ))}
                    </div>

                    {/* Topic comparison */}
                    <Card className="p-6">
                        <h3 className="text-sm font-semibold text-gray-900">Topic-by-topic</h3>
                        <p className="text-xs text-gray-500">Where each student excels or lags within each topic.</p>
                        <div className="mt-4 space-y-3">
                            {data.topics.length === 0 ? (
                                <p className="text-xs text-gray-500">No common topic data.</p>
                            ) : (
                                data.topics.map((t) => (
                                    <div key={t.category}>
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="font-medium text-gray-700">{t.category}</span>
                                            <span className="text-gray-500">
                                                A {formatPct(t.aPercentage)} · B {formatPct(t.bPercentage)}
                                            </span>
                                        </div>
                                        <div className="mt-1 grid grid-cols-2 gap-2">
                                            <div className="h-2 overflow-hidden rounded bg-gray-100">
                                                <div className="h-full bg-indigo-500" style={{ width: `${t.aPercentage ?? 0}%` }} />
                                            </div>
                                            <div className="h-2 overflow-hidden rounded bg-gray-100">
                                                <div className="h-full bg-amber-500" style={{ width: `${t.bPercentage ?? 0}%` }} />
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </Card>

                    {/* Head-to-head content */}
                    <Card className="p-0 overflow-hidden">
                        <div className="border-b border-gray-100 px-5 py-3">
                            <h3 className="text-sm font-semibold text-gray-900">Head-to-head on shared content</h3>
                            <p className="text-xs text-gray-500">Both students attempted these. Sorted by largest score gap.</p>
                        </div>
                        {data.commonContent.length === 0 ? (
                            <div className="py-10 text-center text-sm text-gray-500">
                                No content both students have attempted yet.
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[700px] text-sm">
                                    <thead>
                                        <tr className="border-b border-gray-100 bg-gray-50 text-xs uppercase text-gray-500">
                                            <th className="px-5 py-3 text-left">Content</th>
                                            <th className="px-5 py-3 text-left">A</th>
                                            <th className="px-5 py-3 text-left">B</th>
                                            <th className="px-5 py-3 text-left">A time</th>
                                            <th className="px-5 py-3 text-left">B time</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.commonContent.map((row) => (
                                            <tr key={row.contentId} className="border-b border-gray-100 hover:bg-gray-50">
                                                <td className="px-5 py-3 font-medium text-gray-900">{row.contentTitle}</td>
                                                <td className="px-5 py-3 text-gray-700">
                                                    <span className={`font-bold ${row.aPercentage >= row.bPercentage ? "text-emerald-700" : "text-rose-700"}`}>
                                                        {row.aPercentage}%
                                                    </span>
                                                </td>
                                                <td className="px-5 py-3 text-gray-700">
                                                    <span className={`font-bold ${row.bPercentage >= row.aPercentage ? "text-emerald-700" : "text-rose-700"}`}>
                                                        {row.bPercentage}%
                                                    </span>
                                                </td>
                                                <td className="px-5 py-3 text-gray-600">{formatDuration(row.aDurationSeconds)}</td>
                                                <td className="px-5 py-3 text-gray-600">{formatDuration(row.bDurationSeconds)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </Card>
                </>
            )}
        </div>
    );
}
