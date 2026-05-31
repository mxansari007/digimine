"use client";

/**
 * All-students roster — every student across every class the teacher owns.
 *
 * Designed to match the visual language of the class command-center page:
 *   - Four insight cards with iconified chips
 *   - Compact filter toolbar with search, status, risk, class, sort
 *   - Insight-rich table: avatar, risk badge with reason, avg/best with
 *     trend arrow, coverage bar, recent sparkline, attempts, last active
 *   - Direct per-row "View →" + "Compare" + status mutations
 *   - Skeleton loading instead of "Loading…"
 *
 * Functionality preserved from the old version:
 *   - Server-side `/api/teacher/students/progress` is unchanged
 *   - Filters (search, status, risk, class, inactive 14d+)
 *   - Sort (risk, last active, average, coverage, name)
 *   - CSV export of the currently-filtered set
 *   - Bulk CSV upload button was removed — it just alerted the user to
 *     "use per-class CSV upload" and was dead UI.
 */
import {
    useCallback,
    useEffect,
    useMemo,
    useState,
} from "react";
import Link from "next/link";
import { Button, Card } from "@digimine/ui";
import {
    Users,
    AlertTriangle,
    Clock,
    BarChart3,
    Search,
    Download,
    GitCompareArrows,
    Settings2,
    TrendingDown,
    TrendingUp,
} from "lucide-react";
import { useAuthContext } from "@/contexts/AuthContext";
import { updateEnrollmentStatus } from "@/lib/firestore/teacherEnrollments";
import { HelpTutorial } from "@/components/help/HelpTutorial";
import { TUTORIALS } from "@/components/help/tutorials";

// ─── Types (unchanged) ────────────────────────────────────────────────

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

type SortKey = "risk" | "lastActive" | "average" | "coverage" | "name";

// ─── Page ─────────────────────────────────────────────────────────────

export default function TeacherStudentsPage() {
    const { firebaseUser } = useAuthContext();
    const [students, setStudents] = useState<StudentRow[]>([]);
    const [classes, setClasses] = useState<ClassRef[]>([]);
    const [totals, setTotals] = useState<ProgressTotals>(emptyTotals);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    // Filters / sort
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] =
        useState<"all" | "active" | "banned" | "removed">("active");
    const [riskFilter, setRiskFilter] = useState<"all" | RiskBand>("all");
    const [classFilter, setClassFilter] = useState<string>("all");
    const [onlyInactive14d, setOnlyInactive14d] = useState(false);
    const [sortKey, setSortKey] = useState<SortKey>("risk");

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
        } catch (err) {
            setError((err as Error)?.message || "Failed to load students.");
            setStudents([]);
            setTotals(emptyTotals);
        } finally {
            setLoading(false);
        }
    }, [firebaseUser]);

    useEffect(() => {
        loadStudents();
    }, [loadStudents]);

    const handleStatusChange = async (
        id: string,
        next: "active" | "banned" | "removed"
    ) => {
        if (!firebaseUser) return;
        const verb = next === "banned" ? "Ban" : next === "active" ? "Reinstate" : "Remove";
        if (!confirm(`${verb} this student?`)) return;
        await updateEnrollmentStatus(firebaseUser.uid, id, next);
        await loadStudents();
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
                    return (
                        (b.progress.averagePercentage ?? -1) -
                        (a.progress.averagePercentage ?? -1)
                    );
                case "coverage":
                    return b.progress.progressPercent - a.progress.progressPercent;
                case "lastActive": {
                    const aT = a.progress.lastActiveAt
                        ? Date.parse(a.progress.lastActiveAt)
                        : 0;
                    const bT = b.progress.lastActiveAt
                        ? Date.parse(b.progress.lastActiveAt)
                        : 0;
                    return bT - aT;
                }
                case "risk":
                default:
                    return b.risk.score - a.risk.score;
            }
        });
        return arr;
    }, [students, search, statusFilter, riskFilter, classFilter, onlyInactive14d, sortKey]);

    const handleExport = () => {
        const csv = [
            [
                "Name", "Email", "Roll Number", "Status", "Risk", "Risk score",
                "Risk reasons", "Classes", "Enrolled", "Progress",
                "Completed Content", "Completed Attempts", "Total Attempts",
                "In Progress", "Average", "Best", "Last Active", "Last Content",
            ].map(csvValue).join(","),
        ];
        filtered.forEach((s) => {
            csv.push(
                [
                    s.studentName,
                    s.studentEmail,
                    s.rollNumber || "",
                    s.status,
                    s.risk.band,
                    s.risk.score,
                    s.risk.reasons.join("; "),
                    s.classes.map((c) => c.className).join(" | "),
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

    if (loading) {
        return (
            <div className="space-y-4 py-2">
                <div className="h-8 w-48 animate-pulse rounded bg-slate-200" />
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="h-28 animate-pulse rounded-xl bg-slate-100" />
                    ))}
                </div>
                <div className="h-12 animate-pulse rounded-xl bg-slate-100" />
                <div className="h-96 animate-pulse rounded-xl bg-slate-100" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* ─── Header ──────────────────────────────────────────── */}
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <div className="flex items-center gap-1.5">
                        <h1 className="text-2xl font-bold text-slate-900">All students</h1>
                        <HelpTutorial {...TUTORIALS.teacher_students} />
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                        Every student across every class you own — sortable, filterable, exportable.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Link href="/teacher/students/compare" data-tour="compare-students">
                        <Button variant="outline">
                            <GitCompareArrows
                                className="mr-1.5 h-4 w-4"
                                strokeWidth={2}
                                aria-hidden
                            />
                            Compare students
                        </Button>
                    </Link>
                    <Button variant="outline" onClick={handleExport}>
                        <Download className="mr-1.5 h-4 w-4" strokeWidth={2} aria-hidden />
                        Export CSV
                    </Button>
                </div>
            </div>

            {error && (
                <Card className="border-rose-200 dark:border-rose-500/25 bg-rose-50 dark:bg-rose-500/10 p-4 text-sm text-rose-700 dark:text-rose-300">
                    {error}
                </Card>
            )}

            {/* ─── Insight cards ───────────────────────────────────── */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <InsightCard
                    Icon={Users}
                    label="Active students"
                    value={String(totals.activeStudents)}
                    sub={`${totals.totalStudents} total in roster`}
                    accent="blue"
                />
                <InsightCard
                    Icon={AlertTriangle}
                    label="High risk"
                    value={String(totals.highRiskCount)}
                    sub={`+ ${totals.mediumRiskCount} medium`}
                    accent={totals.highRiskCount > 0 ? "rose" : "slate"}
                />
                <InsightCard
                    Icon={Clock}
                    label="Inactive 14d+"
                    value={String(totals.inactive14dCount)}
                    sub="haven't opened anything"
                    accent={totals.inactive14dCount > 0 ? "amber" : "slate"}
                />
                <InsightCard
                    Icon={BarChart3}
                    label="Completed attempts"
                    value={String(totals.completedAttempts)}
                    sub={`${totals.inProgressAttempts} in progress · ${totals.totalAttempts} total`}
                    accent="indigo"
                />
            </div>

            {/* ─── Filter toolbar ──────────────────────────────────── */}
            <Card data-tour="students-filters" className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative min-w-[220px] flex-1">
                        <Search
                            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                            strokeWidth={2}
                            aria-hidden
                        />
                        <input
                            type="search"
                            placeholder="Search by name, email or roll number"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm shadow-sm transition-all focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                        />
                    </div>
                    <FilterSelect
                        value={statusFilter}
                        onChange={(v) => setStatusFilter(v as typeof statusFilter)}
                        options={[
                            ["active", "Status: Active"],
                            ["banned", "Status: Banned"],
                            ["removed", "Status: Removed"],
                            ["all", "Status: Any"],
                        ]}
                    />
                    <FilterSelect
                        value={riskFilter}
                        onChange={(v) => setRiskFilter(v as typeof riskFilter)}
                        options={[
                            ["all", "Risk: Any"],
                            ["high", "Risk: High"],
                            ["medium", "Risk: Medium"],
                            ["low", "Risk: Low"],
                        ]}
                    />
                    <FilterSelect
                        value={classFilter}
                        onChange={(v) => setClassFilter(v)}
                        options={[
                            ["all", "Class: Any"],
                            ...classes.map((c) => [c.id, `Class: ${c.name}`] as [string, string]),
                        ]}
                    />
                    <FilterSelect
                        value={sortKey}
                        onChange={(v) => setSortKey(v as SortKey)}
                        options={[
                            ["risk", "Sort: Risk (high → low)"],
                            ["lastActive", "Sort: Last active"],
                            ["average", "Sort: Average score"],
                            ["coverage", "Sort: Coverage"],
                            ["name", "Sort: Name (A–Z)"],
                        ]}
                        Icon={Settings2}
                    />
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
                    <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-600">
                        <input
                            type="checkbox"
                            checked={onlyInactive14d}
                            onChange={(e) => setOnlyInactive14d(e.target.checked)}
                            className="h-3.5 w-3.5 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                        />
                        Only show inactive 14d+
                    </label>
                    <p className="text-xs text-slate-500">
                        Showing{" "}
                        <span className="font-semibold text-slate-700">{filtered.length}</span>
                        {filtered.length !== students.length && (
                            <>
                                {" "}of{" "}
                                <span className="font-semibold text-slate-700">
                                    {students.length}
                                </span>
                            </>
                        )}
                    </p>
                </div>
            </Card>

            {/* ─── Roster ──────────────────────────────────────────── */}
            {filtered.length === 0 ? (
                <Card className="p-12 text-center text-sm text-slate-500">
                    {students.length === 0 ? (
                        <>
                            <p className="mb-3">No students enrolled yet.</p>
                            <Link
                                href="/teacher/classes"
                                className="font-medium text-primary-700 hover:text-primary-800"
                            >
                                Create a class and share the invite code →
                            </Link>
                        </>
                    ) : (
                        "No students match the current filters."
                    )}
                </Card>
            ) : (
                <Card className="overflow-hidden p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[1080px] text-sm">
                            <thead>
                                <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                    <th className="px-5 py-2.5">Student</th>
                                    <th className="px-5 py-2.5">Classes</th>
                                    <th className="px-5 py-2.5">Risk</th>
                                    <th className="px-5 py-2.5">Avg / Best</th>
                                    <th className="px-5 py-2.5">Coverage</th>
                                    <th className="px-5 py-2.5">Recent</th>
                                    <th className="px-5 py-2.5">Last active</th>
                                    <th className="px-5 py-2.5"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((s) => (
                                    <RosterRow
                                        key={s.id}
                                        s={s}
                                        onStatus={handleStatusChange}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}
        </div>
    );
}

// ─── Subcomponents ────────────────────────────────────────────────────

function InsightCard({
    Icon,
    label,
    value,
    sub,
    accent,
}: {
    Icon: typeof Users;
    label: string;
    value: string;
    sub: string;
    accent: "blue" | "rose" | "amber" | "indigo" | "slate";
}) {
    const tones: Record<typeof accent, string> = {
        blue: "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-300",
        rose: "bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-300",
        amber: "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-300",
        indigo: "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-300",
        slate: "bg-slate-100 text-slate-500",
    };
    return (
        <Card className="p-5">
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {label}
                    </p>
                    <p className="mt-2 text-3xl font-bold text-slate-900">{value}</p>
                    <p className="mt-1 text-xs text-slate-500">{sub}</p>
                </div>
                <span
                    className={`flex h-9 w-9 items-center justify-center rounded-xl ${tones[accent]}`}
                >
                    <Icon className="h-4.5 w-4.5" strokeWidth={2} aria-hidden />
                </span>
            </div>
        </Card>
    );
}

function FilterSelect({
    value,
    onChange,
    options,
    Icon,
}: {
    value: string;
    onChange: (next: string) => void;
    options: Array<[string, string]>;
    Icon?: typeof Settings2;
}) {
    return (
        <div className="relative">
            {Icon && (
                <Icon
                    className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                    strokeWidth={2}
                    aria-hidden
                />
            )}
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className={`appearance-none rounded-lg border border-slate-300 bg-white py-2 pr-3 text-xs font-medium text-slate-700 shadow-sm transition-all hover:border-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100 ${
                    Icon ? "pl-7" : "pl-3"
                }`}
            >
                {options.map(([v, label]) => (
                    <option key={v} value={v}>
                        {label}
                    </option>
                ))}
            </select>
        </div>
    );
}

function RosterRow({
    s,
    onStatus,
}: {
    s: StudentRow;
    onStatus: (id: string, status: "active" | "banned" | "removed") => void;
}) {
    const riskTone: Record<RiskBand, string> = {
        low: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-200 dark:ring-emerald-500/25",
        medium: "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-amber-200 dark:ring-amber-500/25",
        high: "bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-rose-200 dark:ring-rose-500/25",
    };
    const avg = s.progress.averagePercentage;
    const best = s.progress.bestPercentage;
    const trend = s.risk.metrics.recentTrend;
    return (
        <tr className="border-b border-slate-100 transition-colors hover:bg-slate-50/40">
            <td className="px-5 py-3">
                <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary-50 dark:bg-primary-500/10 text-xs font-semibold text-primary-700 dark:text-primary-300 ring-1 ring-primary-100 dark:ring-primary-500/25">
                        {initialsOf(s.studentName)}
                    </span>
                    <div className="min-w-0">
                        <Link
                            href={`/teacher/students/${encodeURIComponent(s.studentId)}`}
                            className="block truncate text-sm font-medium text-slate-900 hover:text-primary-700"
                        >
                            {s.studentName}
                        </Link>
                        <p className="flex items-center gap-1.5 truncate text-xs text-slate-500">
                            <span className="truncate">{s.studentEmail}</span>
                            {s.rollNumber && (
                                <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">
                                    #{s.rollNumber}
                                </span>
                            )}
                        </p>
                        {s.status !== "active" && (
                            <span
                                className={`mt-0.5 inline-block rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                                    s.status === "banned"
                                        ? "bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300"
                                        : "bg-slate-100 text-slate-600"
                                }`}
                            >
                                {s.status}
                            </span>
                        )}
                    </div>
                </div>
            </td>
            <td className="px-5 py-3">
                {s.classes.length === 0 ? (
                    <span className="text-xs text-slate-400">No class</span>
                ) : (
                    <div className="flex flex-wrap gap-1">
                        {s.classes.slice(0, 2).map((c) => (
                            <Link
                                key={c.classId}
                                href={`/teacher/classes/${c.classId}`}
                                className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700 transition-colors hover:bg-primary-50 dark:hover:bg-primary-500/10 hover:text-primary-700 dark:hover:text-primary-300"
                                title={c.className}
                            >
                                {truncate(c.className, 18)}
                            </Link>
                        ))}
                        {s.classes.length > 2 && (
                            <span
                                className="rounded-full bg-slate-50 px-2 py-0.5 text-[10px] text-slate-500 ring-1 ring-slate-200"
                                title={s.classes.map((c) => c.className).join(", ")}
                            >
                                +{s.classes.length - 2}
                            </span>
                        )}
                    </div>
                )}
            </td>
            <td className="px-5 py-3">
                {s.progress.completedAttempts > 0 ? (
                    <div className="flex flex-col gap-0.5">
                        <span
                            className={`inline-flex w-fit items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ring-1 ring-inset ${riskTone[s.risk.band]}`}
                            title={s.risk.reasons.join(" · ")}
                        >
                            {s.risk.band} · {s.risk.score}
                        </span>
                        {s.risk.reasons[0] && (
                            <span
                                className="max-w-[180px] truncate text-[10px] text-slate-500"
                                title={s.risk.reasons.join(" · ")}
                            >
                                {s.risk.reasons[0]}
                            </span>
                        )}
                    </div>
                ) : (
                    <span className="text-xs text-slate-400">—</span>
                )}
            </td>
            <td className="px-5 py-3 text-xs">
                {avg != null ? (
                    <div>
                        <p className="flex items-center gap-1.5">
                            <span className="font-semibold text-slate-900">{avg}%</span>
                            <span className="text-slate-400">/ {best != null ? `${best}%` : "—"}</span>
                            {trend !== 0 && (
                                <span
                                    className={`inline-flex items-center gap-0.5 text-[10px] font-semibold ${
                                        trend < 0 ? "text-rose-600" : "text-emerald-600"
                                    }`}
                                >
                                    {trend < 0 ? (
                                        <TrendingDown
                                            className="h-3 w-3"
                                            strokeWidth={2.5}
                                            aria-hidden
                                        />
                                    ) : (
                                        <TrendingUp
                                            className="h-3 w-3"
                                            strokeWidth={2.5}
                                            aria-hidden
                                        />
                                    )}
                                    {Math.abs(trend)}
                                </span>
                            )}
                        </p>
                        <p className="text-[10px] text-slate-500">
                            {s.progress.completedAttempts} attempt{s.progress.completedAttempts === 1 ? "" : "s"}
                            {s.progress.inProgressAttempts > 0 && (
                                <span className="ml-1 text-amber-600">
                                    +{s.progress.inProgressAttempts} pending
                                </span>
                            )}
                        </p>
                    </div>
                ) : (
                    <span className="text-slate-400">No attempts</span>
                )}
            </td>
            <td className="px-5 py-3">
                <div className="flex items-center gap-2">
                    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
                        <div
                            className="h-full bg-primary-500"
                            style={{ width: `${s.progress.progressPercent}%` }}
                        />
                    </div>
                    <div className="text-xs">
                        <span className="font-semibold text-slate-700">
                            {s.progress.progressPercent}%
                        </span>
                        <span className="ml-1 text-slate-400">
                            {s.progress.completedContentCount}/{s.progress.totalAssignedContent}
                        </span>
                    </div>
                </div>
            </td>
            <td className="px-5 py-3">
                <Sparkline data={s.sparkline} />
            </td>
            <td className="px-5 py-3">
                <p className="text-xs text-slate-700">
                    {formatRelative(s.progress.lastActiveAt)}
                </p>
                {s.progress.lastContentTitle && (
                    <p className="max-w-[180px] truncate text-[10px] text-slate-400">
                        {s.progress.lastContentTitle}
                    </p>
                )}
            </td>
            <td className="px-5 py-3 text-right">
                <div className="inline-flex items-center gap-2.5">
                    <Link
                        href={`/teacher/students/${encodeURIComponent(s.studentId)}`}
                        className="text-xs font-medium text-primary-700 hover:text-primary-800"
                    >
                        View →
                    </Link>
                    <Link
                        href={`/teacher/students/compare?a=${encodeURIComponent(s.studentId)}`}
                        className="text-xs text-slate-500 hover:text-slate-700"
                        title="Compare with another student"
                    >
                        Compare
                    </Link>
                    {s.status === "active" ? (
                        <button
                            onClick={() => onStatus(s.id, "banned")}
                            className="text-xs text-amber-600 hover:text-amber-700"
                        >
                            Ban
                        </button>
                    ) : s.status === "banned" ? (
                        <button
                            onClick={() => onStatus(s.id, "active")}
                            className="text-xs text-emerald-600 hover:text-emerald-700"
                        >
                            Reinstate
                        </button>
                    ) : null}
                    {s.status !== "removed" && (
                        <button
                            onClick={() => onStatus(s.id, "removed")}
                            className="text-xs text-rose-600 hover:text-rose-700"
                        >
                            Remove
                        </button>
                    )}
                </div>
            </td>
        </tr>
    );
}

function Sparkline({ data, color = "#0d9488" }: { data: number[]; color?: string }) {
    if (!data || data.length === 0) {
        return <span className="text-xs text-slate-400">—</span>;
    }
    const width = 72;
    const height = 22;
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
        <svg width={width} height={height} className="block" aria-hidden>
            <polyline
                points={points}
                fill="none"
                stroke={color}
                strokeWidth={1.6}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <circle
                cx={padding + (data.length - 1) * step}
                cy={padding + innerH - (Math.max(0, Math.min(max, lastValue)) / max) * innerH}
                r={2.2}
                fill={color}
            />
        </svg>
    );
}

// ─── Helpers ──────────────────────────────────────────────────────────

function initialsOf(name: string): string {
    return name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0]?.toUpperCase() || "")
        .join("") || "?";
}

function truncate(s: string, n: number): string {
    if (s.length <= n) return s;
    return s.slice(0, n - 1) + "…";
}

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

function formatRelative(iso: string | null): string {
    if (!iso) return "Never";
    const ms = new Date(iso).getTime();
    if (!Number.isFinite(ms)) return "Never";
    const diff = Date.now() - ms;
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return "Just now";
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const day = Math.floor(hr / 24);
    if (day < 30) return `${day}d ago`;
    const mo = Math.floor(day / 30);
    if (mo < 12) return `${mo}mo ago`;
    const yr = Math.floor(day / 365);
    return `${yr}y ago`;
}

function csvValue(value: unknown) {
    return `"${String(value ?? "").replace(/"/g, '""')}"`;
}
