"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { Button, Card } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { updateEnrollmentStatus } from "@/lib/firestore/teacherEnrollments";

type StudentProgress = {
    progressPercent: number;
    totalAttempts: number;
    completedAttempts: number;
    inProgressAttempts: number;
    averagePercentage: number | null;
    bestPercentage: number | null;
    completedContentCount: number;
    totalAssignedContent: number;
    lastActiveAt: string | null;
    lastContentTitle: string | null;
};

type RiskBand = "low" | "medium" | "high";

type Risk = {
    score: number;
    band: RiskBand;
    reasons: string[];
    metrics: {
        averagePercentage: number | null;
        recentTrend: number;
        daysSinceLastActive: number | null;
        coveragePercent: number;
    };
};

type StudentRow = {
    id: string;
    studentId: string;
    studentEmail: string;
    studentName: string;
    rollNumber: string | null;
    enrolledAt: string | null;
    status: "active" | "banned" | "removed";
    progress: StudentProgress;
    risk: Risk;
    sparkline: number[];
    classes: Array<{ classId: string; className: string; status: string }>;
};

type ClassRef = { id: string; name: string; isArchived: boolean };

type ProgressTotals = {
    totalStudents: number;
    activeStudents: number;
    totalAssignedContent: number;
    totalAttempts: number;
    completedAttempts: number;
    inProgressAttempts: number;
    highRiskCount: number;
    mediumRiskCount: number;
    inactive14dCount: number;
};

const emptyTotals: ProgressTotals = {
    totalStudents: 0,
    activeStudents: 0,
    totalAssignedContent: 0,
    totalAttempts: 0,
    completedAttempts: 0,
    inProgressAttempts: 0,
    highRiskCount: 0,
    mediumRiskCount: 0,
    inactive14dCount: 0,
};

function formatDate(value?: string | null) {
    if (!value) return "-";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("en-IN");
}

function formatDateTime(value?: string | null) {
    if (!value) return "-";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function formatPercent(value: number | null) {
    return typeof value === "number" ? `${value}%` : "-";
}

function csvValue(value: unknown) {
    return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

const riskBg: Record<RiskBand, string> = {
    low: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
    medium: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
    high: "bg-red-50 text-red-700 ring-1 ring-red-200",
};

function Sparkline({ data, color = "#0d9488" }: { data: number[]; color?: string }) {
    if (!data || data.length === 0) {
        return <span className="text-xs text-gray-400">—</span>;
    }
    const width = 80;
    const height = 24;
    const padding = 2;
    const innerW = width - padding * 2;
    const innerH = height - padding * 2;
    const max = 100;
    const step = data.length === 1 ? 0 : innerW / (data.length - 1);
    const points = data
        .map((v, i) => {
            const x = padding + i * step;
            const y = padding + innerH - (Math.max(0, Math.min(max, v)) / max) * innerH;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(" ");
    const lastValue = data[data.length - 1];

    return (
        <div className="inline-flex items-center gap-2">
            <svg width={width} height={height} className="block">
                <polyline points={points} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
                {data.length > 0 && (
                    <circle
                        cx={padding + (data.length - 1) * step}
                        cy={padding + innerH - (Math.max(0, Math.min(max, lastValue)) / max) * innerH}
                        r={2.2}
                        fill={color}
                    />
                )}
            </svg>
            <span className="text-[10px] text-gray-500">{data.length}/5</span>
        </div>
    );
}

function Avatar({ name }: { name: string }) {
    const initials = (name || "?")
        .split(/\s+/)
        .map((w) => w[0]?.toUpperCase() || "")
        .filter(Boolean)
        .slice(0, 2)
        .join("");
    const hue = Array.from(name).reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % 360;
    return (
        <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
            style={{ backgroundColor: `hsl(${hue}, 50%, 50%)` }}
            aria-hidden="true"
        >
            {initials || "?"}
        </div>
    );
}

type SortKey = "name" | "risk" | "average" | "lastActive" | "coverage";

export default function TeacherStudentsPage() {
    const { firebaseUser } = useAuthContext();
    const [students, setStudents] = useState<StudentRow[]>([]);
    const [classes, setClasses] = useState<ClassRef[]>([]);
    const [totals, setTotals] = useState<ProgressTotals>(emptyTotals);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    // Filters / sorting
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<"all" | "active" | "banned" | "removed">("active");
    const [riskFilter, setRiskFilter] = useState<"all" | RiskBand>("all");
    const [classFilter, setClassFilter] = useState<string>("all");
    const [onlyInactive14d, setOnlyInactive14d] = useState(false);
    const [sortKey, setSortKey] = useState<SortKey>("risk");

    const fileRef = useRef<HTMLInputElement>(null);

    const loadStudents = useCallback(async () => {
        if (!firebaseUser) return;
        setLoading(true);
        setError("");
        try {
            const token = await firebaseUser.getIdToken();
            const res = await fetch(
                `/api/teacher/students/progress?teacherId=${encodeURIComponent(firebaseUser.uid)}`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to load student progress.");
            setStudents(data.students || []);
            setClasses((data.classes || []).filter((c: ClassRef) => !c.isArchived));
            setTotals(data.totals || emptyTotals);
        } catch (err: any) {
            setError(err.message || "Failed to load students.");
            setStudents([]);
            setTotals(emptyTotals);
        } finally {
            setLoading(false);
        }
    }, [firebaseUser]);

    useEffect(() => {
        loadStudents();
    }, [loadStudents]);

    const handleStatusChange = async (id: string, next: "active" | "banned" | "removed") => {
        if (!firebaseUser) return;
        const verb = next === "banned" ? "Ban" : next === "active" ? "Reinstate" : "Remove";
        if (!confirm(`${verb} this student?`)) return;
        await updateEnrollmentStatus(firebaseUser.uid, id, next);
        await loadStudents();
    };

    const handleCsv = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !firebaseUser) return;
        // The roster-level CSV import has been moved to the per-class page.
        // Redirect the teacher to /teacher/classes for this. We still parse and
        // surface a friendly hint here.
        alert(
            "CSV uploads now happen per class. Open a class → Add students → Upload CSV. " +
                "This keeps each student tied to a specific class roster."
        );
        if (event.target) event.target.value = "";
    };

    const handleExport = () => {
        const rows = filtered;
        const csv = [
            [
                "Name",
                "Email",
                "Roll Number",
                "Status",
                "Risk",
                "Risk score",
                "Risk reasons",
                "Classes",
                "Enrolled",
                "Progress",
                "Completed Content",
                "Completed Attempts",
                "Total Attempts",
                "In Progress",
                "Average",
                "Best",
                "Last Active",
                "Last Content",
            ].map(csvValue).join(","),
        ];
        rows.forEach((s) => {
            csv.push(
                [
                    s.studentName,
                    s.studentEmail,
                    s.rollNumber || "",
                    s.status,
                    s.risk.band,
                    s.risk.score,
                    s.risk.reasons.join("; "),
                    (s.classes || []).map((c) => c.className).join(" | "),
                    formatDate(s.enrolledAt),
                    `${s.progress.progressPercent}%`,
                    `${s.progress.completedContentCount}/${s.progress.totalAssignedContent}`,
                    s.progress.completedAttempts,
                    s.progress.totalAttempts,
                    s.progress.inProgressAttempts,
                    formatPercent(s.progress.averagePercentage),
                    formatPercent(s.progress.bestPercentage),
                    formatDateTime(s.progress.lastActiveAt),
                    s.progress.lastContentTitle || "",
                ]
                    .map(csvValue)
                    .join(",")
            );
        });

        const blob = new Blob([csv.join("\n")], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "students-progress.csv";
        a.click();
        URL.revokeObjectURL(url);
    };

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        const arr = students.filter((s) => {
            if (statusFilter !== "all" && s.status !== statusFilter) return false;
            if (riskFilter !== "all" && s.risk.band !== riskFilter) return false;
            if (classFilter !== "all") {
                if (!s.classes.some((c) => c.classId === classFilter)) return false;
            }
            if (onlyInactive14d) {
                const days = s.risk.metrics.daysSinceLastActive;
                if (!(days === null || days >= 14)) return false;
            }
            if (q) {
                const hay = `${s.studentName} ${s.studentEmail} ${s.rollNumber || ""}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });
        arr.sort((a, b) => {
            switch (sortKey) {
                case "name":
                    return a.studentName.localeCompare(b.studentName);
                case "average":
                    return (b.progress.averagePercentage ?? -1) - (a.progress.averagePercentage ?? -1);
                case "coverage":
                    return b.progress.progressPercent - a.progress.progressPercent;
                case "lastActive": {
                    const aT = a.progress.lastActiveAt ? Date.parse(a.progress.lastActiveAt) : 0;
                    const bT = b.progress.lastActiveAt ? Date.parse(b.progress.lastActiveAt) : 0;
                    return bT - aT;
                }
                case "risk":
                default:
                    return b.risk.score - a.risk.score;
            }
        });
        return arr;
    }, [students, search, statusFilter, riskFilter, classFilter, onlyInactive14d, sortKey]);

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Students</h1>
                    <p className="mt-1 text-gray-500">Every student across every class you own.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Link href="/teacher/students/compare">
                        <Button variant="outline">Compare two students →</Button>
                    </Link>
                    <Link href="/teacher/classes">
                        <Button variant="outline">Manage classes →</Button>
                    </Link>
                </div>
            </div>

            {error && (
                <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</Card>
            )}

            {/* Top stat strip */}
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
                <Card className="p-5">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Active</p>
                    <p className="mt-2 text-2xl font-bold text-gray-900">{totals.activeStudents}</p>
                    <p className="mt-1 text-xs text-gray-500">{totals.totalStudents} total in roster</p>
                </Card>
                <Card className="p-5">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">High risk</p>
                    <p className="mt-2 text-2xl font-bold text-red-600">{totals.highRiskCount}</p>
                    <p className="mt-1 text-xs text-gray-500">
                        + {totals.mediumRiskCount} medium-risk students
                    </p>
                </Card>
                <Card className="p-5">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Inactive 14d+</p>
                    <p className="mt-2 text-2xl font-bold text-amber-700">{totals.inactive14dCount}</p>
                    <p className="mt-1 text-xs text-gray-500">Haven&apos;t opened anything recently</p>
                </Card>
                <Card className="p-5">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Attempts</p>
                    <p className="mt-2 text-2xl font-bold text-gray-900">{totals.completedAttempts}</p>
                    <p className="mt-1 text-xs text-gray-500">
                        {totals.inProgressAttempts} in progress · {totals.totalAttempts} total
                    </p>
                </Card>
                <Card className="p-5">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Content live</p>
                    <p className="mt-2 text-2xl font-bold text-gray-900">{totals.totalAssignedContent}</p>
                    <p className="mt-1 text-xs text-gray-500">Quizzes + tests published</p>
                </Card>
            </div>

            {/* Filter & search */}
            <Card className="p-4">
                <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_1fr_1fr_auto]">
                    <input
                        type="search"
                        placeholder="Search by name, email or roll number"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    >
                        <option value="active">Status: Active</option>
                        <option value="banned">Banned</option>
                        <option value="removed">Removed</option>
                        <option value="all">Any status</option>
                    </select>
                    <select
                        value={riskFilter}
                        onChange={(e) => setRiskFilter(e.target.value as typeof riskFilter)}
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    >
                        <option value="all">Risk: any</option>
                        <option value="high">High risk</option>
                        <option value="medium">Medium risk</option>
                        <option value="low">Low risk</option>
                    </select>
                    <select
                        value={classFilter}
                        onChange={(e) => setClassFilter(e.target.value)}
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    >
                        <option value="all">Class: any</option>
                        {classes.map((c) => (
                            <option key={c.id} value={c.id}>
                                {c.name}
                            </option>
                        ))}
                    </select>
                    <select
                        value={sortKey}
                        onChange={(e) => setSortKey(e.target.value as SortKey)}
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    >
                        <option value="risk">Sort: Risk (high → low)</option>
                        <option value="lastActive">Last active</option>
                        <option value="average">Average score</option>
                        <option value="coverage">Coverage</option>
                        <option value="name">Name (A-Z)</option>
                    </select>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <label className="flex items-center gap-2 text-xs text-gray-600">
                        <input
                            type="checkbox"
                            checked={onlyInactive14d}
                            onChange={(e) => setOnlyInactive14d(e.target.checked)}
                        />
                        Only show inactive 14d+
                    </label>
                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={() => fileRef.current?.click()}>
                            Upload CSV
                        </Button>
                        <input ref={fileRef} type="file" accept=".csv" onChange={handleCsv} className="hidden" />
                        <Button variant="outline" onClick={handleExport}>
                            Export CSV
                        </Button>
                    </div>
                </div>
            </Card>

            {/* Roster table */}
            {loading ? (
                <div className="py-16 text-center text-gray-500">Loading...</div>
            ) : filtered.length === 0 ? (
                <Card className="p-12 text-center text-gray-500">
                    {students.length === 0 ? (
                        <>
                            <p className="mb-3">No students enrolled yet.</p>
                            <Link href="/teacher/classes" className="text-primary-700 underline">
                                Create a class and share the invite code
                            </Link>
                        </>
                    ) : (
                        "No students match the current filters."
                    )}
                </Card>
            ) : (
                <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
                    <table className="w-full min-w-[1280px] text-sm">
                        <thead>
                            <tr className="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-500">
                                <th className="px-5 py-3 text-left">Student</th>
                                <th className="px-5 py-3 text-left">Classes</th>
                                <th className="px-5 py-3 text-left">Risk</th>
                                <th className="px-5 py-3 text-left">Progress</th>
                                <th className="px-5 py-3 text-left">Average / Best</th>
                                <th className="px-5 py-3 text-left">Recent</th>
                                <th className="px-5 py-3 text-left">Attempts</th>
                                <th className="px-5 py-3 text-left">Last active</th>
                                <th className="px-5 py-3 text-left">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((s) => (
                                <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50">
                                    <td className="px-5 py-3">
                                        <div className="flex items-center gap-3">
                                            <Avatar name={s.studentName} />
                                            <div className="min-w-0">
                                                <Link
                                                    href={`/teacher/students/${encodeURIComponent(s.studentId)}`}
                                                    className="font-medium text-gray-900 hover:text-primary-700"
                                                >
                                                    {s.studentName}
                                                </Link>
                                                <p className="truncate text-xs text-gray-500">
                                                    {s.studentEmail}
                                                    {s.rollNumber && (
                                                        <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] text-gray-600">
                                                            #{s.rollNumber}
                                                        </span>
                                                    )}
                                                </p>
                                                {s.status !== "active" && (
                                                    <span className="mt-1 inline-block text-[10px] font-bold uppercase text-gray-500">
                                                        {s.status}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-5 py-3">
                                        {s.classes.length === 0 ? (
                                            <span className="text-xs text-gray-400">no class</span>
                                        ) : (
                                            <div className="flex flex-wrap gap-1">
                                                {s.classes.slice(0, 3).map((c) => (
                                                    <Link
                                                        key={c.classId}
                                                        href={`/teacher/classes/${c.classId}`}
                                                        className="rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-semibold text-primary-700 hover:bg-primary-100"
                                                    >
                                                        {c.className}
                                                    </Link>
                                                ))}
                                                {s.classes.length > 3 && (
                                                    <span className="text-[10px] text-gray-500">
                                                        +{s.classes.length - 3}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-5 py-3">
                                        <div className="flex flex-col gap-1">
                                            <span className={`inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${riskBg[s.risk.band]}`}>
                                                {s.risk.band.toUpperCase()}
                                                <span className="text-[10px] opacity-70">{s.risk.score}</span>
                                            </span>
                                            {s.risk.reasons[0] && (
                                                <span
                                                    className="max-w-[180px] truncate text-[10px] text-gray-500"
                                                    title={s.risk.reasons.join(" · ")}
                                                >
                                                    {s.risk.reasons[0]}
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-5 py-3">
                                        <div className="flex items-center gap-2">
                                            <div className="h-2 w-24 overflow-hidden rounded-full bg-gray-100">
                                                <div
                                                    className="h-full rounded-full bg-primary-600"
                                                    style={{ width: `${s.progress.progressPercent}%` }}
                                                />
                                            </div>
                                            <div>
                                                <p className="text-xs font-semibold text-gray-900">
                                                    {s.progress.progressPercent}%
                                                </p>
                                                <p className="text-[10px] text-gray-500">
                                                    {s.progress.completedContentCount}/{s.progress.totalAssignedContent}
                                                </p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-5 py-3 text-gray-700">
                                        <p className="font-semibold text-gray-900">
                                            {formatPercent(s.progress.averagePercentage)}
                                        </p>
                                        <p className="text-[10px] text-gray-500">
                                            Best {formatPercent(s.progress.bestPercentage)}
                                            {s.risk.metrics.recentTrend !== 0 && (
                                                <span
                                                    className={`ml-2 font-semibold ${
                                                        s.risk.metrics.recentTrend < 0 ? "text-rose-600" : "text-emerald-600"
                                                    }`}
                                                >
                                                    {s.risk.metrics.recentTrend > 0 ? "+" : ""}
                                                    {s.risk.metrics.recentTrend}
                                                </span>
                                            )}
                                        </p>
                                    </td>
                                    <td className="px-5 py-3">
                                        <Sparkline data={s.sparkline} />
                                    </td>
                                    <td className="px-5 py-3 text-gray-700">
                                        <p className="font-semibold text-gray-900">
                                            {s.progress.completedAttempts}/{s.progress.totalAttempts}
                                        </p>
                                        <p className="text-[10px] text-gray-500">
                                            {s.progress.inProgressAttempts} in progress
                                        </p>
                                    </td>
                                    <td className="px-5 py-3 text-gray-600">
                                        <p>{formatDateTime(s.progress.lastActiveAt)}</p>
                                        {s.progress.lastContentTitle && (
                                            <p className="max-w-[180px] truncate text-[10px] text-gray-500">
                                                {s.progress.lastContentTitle}
                                            </p>
                                        )}
                                    </td>
                                    <td className="px-5 py-3">
                                        <div className="flex flex-wrap gap-2 text-xs">
                                            <Link
                                                href={`/teacher/students/${encodeURIComponent(s.studentId)}`}
                                                className="font-medium text-primary-700 hover:text-primary-800"
                                            >
                                                View
                                            </Link>
                                            <Link
                                                href={`/teacher/students/compare?a=${encodeURIComponent(s.studentId)}`}
                                                className="text-slate-600 hover:text-slate-900"
                                            >
                                                Compare
                                            </Link>
                                            {s.status === "active" && (
                                                <button
                                                    onClick={() => handleStatusChange(s.id, "banned")}
                                                    className="text-amber-600 hover:text-amber-700"
                                                >
                                                    Ban
                                                </button>
                                            )}
                                            {s.status === "banned" && (
                                                <button
                                                    onClick={() => handleStatusChange(s.id, "active")}
                                                    className="text-emerald-600 hover:text-emerald-700"
                                                >
                                                    Reinstate
                                                </button>
                                            )}
                                            {s.status !== "removed" && (
                                                <button
                                                    onClick={() => handleStatusChange(s.id, "removed")}
                                                    className="text-red-600 hover:text-red-700"
                                                >
                                                    Remove
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
