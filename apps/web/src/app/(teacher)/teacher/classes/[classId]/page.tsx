"use client";

/**
 * Class command-center page.
 *
 * Replaces the previous bare roster (name + email + status + enrolled date)
 * with an insight-rich layout designed for the teacher to actually JUDGE
 * their students at a glance:
 *
 *   - Header with class metadata + actions (Analytics, Settings, Archive,
 *     Add students)
 *   - 4 inline insight cards: active students, class average, pass rate,
 *     at-risk count
 *   - Two attention panels: "Needs attention" (top high-risk performers)
 *     and "Not started" (active students with zero attempts)
 *   - Enhanced roster table with per-student risk band, avg / best %,
 *     coverage, last active, and a direct drill-down to the student
 *     detail page
 *   - Roster supports sort (by risk / avg / coverage / last active / name)
 *     and a free-text search
 *   - Existing CRUD preserved (ban / reinstate / remove / add by email /
 *     CSV import / rename / archive / regenerate invite code)
 *
 * Data flow: one fetch to `/api/teacher/classes/[id]/overview` returns
 * everything in a single round-trip. Mutations still hit the dedicated
 * /students endpoints and call `load()` to refresh.
 */
import {
    useCallback,
    useEffect,
    useMemo,
    useState,
    type ChangeEvent,
    useRef,
} from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Button, Card, useToast } from "@digimine/ui";
import {
    AlertTriangle,
    Users,
    TrendingUp,
    Target,
    Search,
    Copy,
    RefreshCw,
    Upload,
    Download,
    Settings as SettingsIcon,
    Archive,
    ChevronRight,
    UserPlus,
} from "lucide-react";
import { useAuthContext } from "@/contexts/AuthContext";
import { teacherFetch } from "@/lib/api/teacherFetch";
import { HelpTutorial } from "@/components/help/HelpTutorial";
import { TUTORIALS } from "@/components/help/tutorials";

// ─── Types ────────────────────────────────────────────────────────────

type ClassMeta = {
    id: string;
    name: string;
    description: string | null;
    inviteCode: string;
    isArchived: boolean;
    studentsCount: number;
    activeStudentsCount: number;
    createdAt: string | null;
};

type RiskBand = "low" | "medium" | "high";

type StudentRow = {
    id: string;
    studentId: string;
    studentName: string;
    studentEmail: string;
    rollNumber: string | null;
    status: "active" | "banned" | "removed";
    enrolledAt: string | null;
    isPending: boolean;
    stats: {
        totalAttempts: number;
        completedAttempts: number;
        inProgressAttempts: number;
        averagePercentage: number | null;
        bestPercentage: number | null;
        completedContentCount: number;
        coveragePercent: number;
        lastActiveAt: string | null;
    };
    risk: {
        score: number;
        band: RiskBand;
        reasons: string[];
    };
    sparkline: number[];
    weakTopics: { category: string; attempts: number; avgPercentage: number }[];
};

type Insights = {
    totalAssignedContent: number;
    activeStudents: number;
    rosterCount: number;
    studentsWithData: number;
    classAverage: number | null;
    passRate: number | null;
    atRiskCount: number;
};

type OverviewResponse = {
    class: ClassMeta;
    insights: Insights;
    students: StudentRow[];
    needsAttention: StudentRow[];
    notStarted: StudentRow[];
};

type SortKey = "risk" | "avg" | "coverage" | "lastActive" | "name";

// ─── Page ─────────────────────────────────────────────────────────────

export default function TeacherClassDetailPage() {
    const params = useParams();
    const router = useRouter();
    const toast = useToast();
    const classId = params.classId as string;
    const { firebaseUser } = useAuthContext();

    const [data, setData] = useState<OverviewResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [showSettings, setShowSettings] = useState(false);
    const [emailInput, setEmailInput] = useState("");
    const [adding, setAdding] = useState(false);
    const [savingName, setSavingName] = useState(false);
    const [search, setSearch] = useState("");
    const [sort, setSort] = useState<SortKey>("risk");
    const [statusFilter, setStatusFilter] =
        useState<"all" | "active" | "banned" | "removed">("active");
    const [copyState, setCopyState] = useState<"idle" | "code" | "link">("idle");
    const fileRef = useRef<HTMLInputElement>(null);

    const load = useCallback(async () => {
        if (!firebaseUser) return;
        setLoading(true);
        setError("");
        try {
            const res = await teacherFetch(
                firebaseUser,
                `/api/teacher/classes/${encodeURIComponent(classId)}/overview`
            );
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || "Failed to load class.");
            setData(body as OverviewResponse);
        } catch (err) {
            setError((err as Error)?.message || "Failed to load class.");
        } finally {
            setLoading(false);
        }
    }, [classId, firebaseUser]);

    useEffect(() => {
        load();
    }, [load]);

    const copyInviteCode = () => {
        if (!data?.class) return;
        navigator.clipboard.writeText(data.class.inviteCode);
        setCopyState("code");
        setTimeout(() => setCopyState("idle"), 1500);
    };

    const copyInviteLink = () => {
        if (!data?.class) return;
        const url = `${window.location.origin}/join/${data.class.inviteCode}`;
        navigator.clipboard.writeText(url);
        setCopyState("link");
        setTimeout(() => setCopyState("idle"), 1500);
    };

    const regenerateInvite = async () => {
        if (!firebaseUser || !data?.class) return;
        if (!confirm("Regenerate the invite code? The current link will stop working."))
            return;
        try {
            const res = await teacherFetch(
                firebaseUser,
                `/api/teacher/classes/${encodeURIComponent(classId)}`,
                {
                    method: "PATCH",
                    body: JSON.stringify({ regenerateInviteCode: true }),
                }
            );
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || "Failed to regenerate invite code.");
            await load();
        } catch (err) {
            toast.error((err as Error)?.message || "Failed to regenerate invite code.");
        }
    };

    const renameClass = async (name: string, description: string | null) => {
        if (!firebaseUser) return;
        setSavingName(true);
        try {
            const res = await teacherFetch(
                firebaseUser,
                `/api/teacher/classes/${encodeURIComponent(classId)}`,
                {
                    method: "PATCH",
                    body: JSON.stringify({ name, description }),
                }
            );
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || "Failed to update class.");
            setShowSettings(false);
            await load();
        } catch (err) {
            toast.error((err as Error)?.message || "Failed to update class.");
        } finally {
            setSavingName(false);
        }
    };

    const archiveClass = async () => {
        if (!firebaseUser || !data?.class) return;
        if (!confirm("Archive this class? Students will lose access to its content.")) return;
        try {
            const res = await teacherFetch(
                firebaseUser,
                `/api/teacher/classes/${encodeURIComponent(classId)}`,
                { method: "DELETE" }
            );
            if (!res.ok) {
                const body = await res.json();
                throw new Error(body.error || "Failed to archive class.");
            }
            router.push("/teacher/classes");
        } catch (err) {
            toast.error((err as Error)?.message || "Failed to archive class.");
        }
    };

    const addStudent = async () => {
        if (!firebaseUser || !emailInput.trim()) return;
        setAdding(true);
        try {
            const res = await teacherFetch(
                firebaseUser,
                `/api/teacher/classes/${encodeURIComponent(classId)}/students`,
                {
                    method: "POST",
                    body: JSON.stringify({ studentEmail: emailInput.trim() }),
                }
            );
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || "Failed to add student.");
            setEmailInput("");
            await load();
        } catch (err) {
            toast.error((err as Error)?.message || "Failed to add student.");
        } finally {
            setAdding(false);
        }
    };

    const handleStatus = async (
        studentId: string,
        status: "active" | "banned" | "removed"
    ) => {
        if (!firebaseUser) return;
        if (status === "removed" && !confirm("Remove this student from the class?")) return;
        try {
            const res = await teacherFetch(
                firebaseUser,
                `/api/teacher/classes/${encodeURIComponent(classId)}/students/${encodeURIComponent(studentId)}`,
                {
                    method: "PATCH",
                    body: JSON.stringify({ status }),
                }
            );
            if (!res.ok) {
                const body = await res.json();
                throw new Error(body.error || "Failed to update student.");
            }
            await load();
        } catch (err) {
            toast.error((err as Error)?.message || "Failed to update student.");
        }
    };

    const handleCsv = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !firebaseUser) return;
        const reader = new FileReader();
        reader.onload = async (ev) => {
            const text = ev.target?.result as string;
            const lines = text.split("\n").filter((line) => line.trim());
            const header = lines[0]?.toLowerCase() || "";
            const headerCells = header.split(",").map((c) => c.trim());
            const nameIndex = headerCells.findIndex((c) => c.includes("name"));
            const emailIndex = headerCells.findIndex((c) => c.includes("email"));
            for (let i = 1; i < lines.length; i++) {
                const cells = lines[i].split(",");
                const email = (cells[emailIndex >= 0 ? emailIndex : 0] || "").trim();
                const name = (cells[nameIndex >= 0 ? nameIndex : 1] || "").trim();
                if (!email) continue;
                await teacherFetch(
                    firebaseUser,
                    `/api/teacher/classes/${encodeURIComponent(classId)}/students`,
                    {
                        method: "POST",
                        body: JSON.stringify({ studentEmail: email, studentName: name }),
                    }
                ).catch(() => null);
            }
            event.target.value = "";
            await load();
        };
        reader.readAsText(file);
    };

    const exportRosterCsv = useCallback(() => {
        if (!data) return;
        const header = [
            "Name",
            "Email",
            "Roll number",
            "Status",
            "Risk score",
            "Risk band",
            "Avg %",
            "Best %",
            "Coverage %",
            "Total attempts",
            "Completed",
            "In progress",
            "Last active",
            "Weak topic 1",
            "Weak topic 2",
            "Weak topic 3",
        ];
        const rows = data.students.map((s) => [
            s.studentName,
            s.studentEmail,
            s.rollNumber ?? "",
            s.status,
            s.stats.completedAttempts > 0 ? String(s.risk.score) : "",
            s.stats.completedAttempts > 0 ? s.risk.band : "",
            s.stats.averagePercentage != null ? String(s.stats.averagePercentage) : "",
            s.stats.bestPercentage != null ? String(s.stats.bestPercentage) : "",
            String(s.stats.coveragePercent),
            String(s.stats.totalAttempts),
            String(s.stats.completedAttempts),
            String(s.stats.inProgressAttempts),
            s.stats.lastActiveAt ?? "",
            ...[0, 1, 2].map((i) => {
                const t = s.weakTopics[i];
                return t ? `${t.category} (${t.avgPercentage}%, ${t.attempts}x)` : "";
            }),
        ]);
        const csv = [header, ...rows]
            .map((row) =>
                row
                    .map((cell) => {
                        const v = String(cell ?? "");
                        return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
                    })
                    .join(",")
            )
            .join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        const safeClassName =
            data.class.name.replace(/[^a-z0-9-_]+/gi, "-").toLowerCase() || "class";
        link.href = url;
        link.download = `roster-${safeClassName}-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }, [data]);

    const filteredStudents = useMemo<StudentRow[]>(() => {
        if (!data) return [];
        const needle = search.trim().toLowerCase();
        return data.students
            .filter((s) => (statusFilter === "all" ? true : s.status === statusFilter))
            .filter((s) => {
                if (!needle) return true;
                return (
                    s.studentName.toLowerCase().includes(needle) ||
                    s.studentEmail.toLowerCase().includes(needle) ||
                    (s.rollNumber || "").toLowerCase().includes(needle)
                );
            })
            .sort((a, b) => {
                if (sort === "risk") return b.risk.score - a.risk.score;
                if (sort === "avg")
                    return (b.stats.averagePercentage ?? -1) - (a.stats.averagePercentage ?? -1);
                if (sort === "coverage") return b.stats.coveragePercent - a.stats.coveragePercent;
                if (sort === "lastActive") {
                    const am = a.stats.lastActiveAt
                        ? new Date(a.stats.lastActiveAt).getTime()
                        : 0;
                    const bm = b.stats.lastActiveAt
                        ? new Date(b.stats.lastActiveAt).getTime()
                        : 0;
                    return bm - am;
                }
                return a.studentName.localeCompare(b.studentName);
            });
    }, [data, search, sort, statusFilter]);

    if (loading) {
        return (
            <div className="space-y-4 py-8">
                <div className="h-8 w-64 animate-pulse rounded bg-slate-200" />
                <div className="grid gap-4 md:grid-cols-4">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="h-28 animate-pulse rounded-xl bg-slate-100" />
                    ))}
                </div>
                <div className="h-96 animate-pulse rounded-xl bg-slate-100" />
            </div>
        );
    }

    if (error || !data) {
        return (
            <Card className="p-8 text-center text-rose-700">
                {error || "Class not found."}
                <Link
                    href="/teacher/classes"
                    className="ml-2 text-primary-700 underline"
                >
                    Back to classes
                </Link>
            </Card>
        );
    }

    const { class: classroom, insights, needsAttention, notStarted } = data;

    return (
        <div className="space-y-6">
            {/* ─── Header ──────────────────────────────────────────── */}
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <Link
                        href="/teacher/classes"
                        className="text-sm text-primary-700 hover:text-primary-800"
                    >
                        ← Back to classes
                    </Link>
                    <div className="mt-1 flex items-center gap-1.5">
                        <h1 className="text-2xl font-bold text-slate-900">
                            {classroom.name}
                        </h1>
                        <HelpTutorial {...TUTORIALS.teacher_class_detail} />
                    </div>
                    {classroom.description && (
                        <p className="mt-1 max-w-2xl text-sm text-slate-500">
                            {classroom.description}
                        </p>
                    )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {classroom.isArchived && (
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                            Archived
                        </span>
                    )}
                    <Link
                        href={`/teacher/classes/${classroom.id}/analytics`}
                        data-tour="deep-analytics"
                    >
                        <Button variant="outline">Deep analytics</Button>
                    </Link>
                    <Button variant="outline" onClick={() => setShowSettings(true)}>
                        <SettingsIcon className="mr-1.5 h-4 w-4" strokeWidth={2} aria-hidden />
                        Settings
                    </Button>
                    {!classroom.isArchived && (
                        <Button
                            variant="outline"
                            onClick={archiveClass}
                            className="border-rose-200 text-rose-600 hover:bg-rose-50"
                        >
                            <Archive className="mr-1.5 h-4 w-4" strokeWidth={2} aria-hidden />
                            Archive
                        </Button>
                    )}
                </div>
            </div>

            {/* ─── Insight cards ───────────────────────────────────── */}
            <div data-tour="class-insight-cards" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <InsightCard
                    Icon={Users}
                    label="Active students"
                    value={String(insights.activeStudents)}
                    sub={`${insights.rosterCount} in roster`}
                    accent="blue"
                />
                <InsightCard
                    Icon={TrendingUp}
                    label="Class average"
                    value={insights.classAverage != null ? `${insights.classAverage}%` : "—"}
                    sub={
                        insights.studentsWithData > 0
                            ? `across ${insights.studentsWithData} student${insights.studentsWithData === 1 ? "" : "s"}`
                            : "no attempts yet"
                    }
                    accent="emerald"
                />
                <InsightCard
                    Icon={Target}
                    label="Pass rate"
                    value={insights.passRate != null ? `${insights.passRate}%` : "—"}
                    sub="40%+ average"
                    accent="indigo"
                />
                <InsightCard
                    Icon={AlertTriangle}
                    label="At risk"
                    value={String(insights.atRiskCount)}
                    sub={
                        insights.atRiskCount > 0
                            ? "needs attention"
                            : "everyone's on track"
                    }
                    accent={insights.atRiskCount > 0 ? "rose" : "slate"}
                />
            </div>

            {/* ─── Needs attention + Not started ───────────────────── */}
            {(needsAttention.length > 0 || notStarted.length > 0) && (
                <div className="grid gap-4 lg:grid-cols-2">
                    {needsAttention.length > 0 && (
                        <AttentionPanel
                            title="Needs attention"
                            description="Active students with the highest risk scores. Click to drill in."
                            accent="rose"
                            students={needsAttention}
                            showRisk
                        />
                    )}
                    {notStarted.length > 0 && (
                        <AttentionPanel
                            title="Hasn't started"
                            description="Active students with zero attempts. Consider sending a nudge."
                            accent="amber"
                            students={notStarted}
                            showRisk={false}
                        />
                    )}
                </div>
            )}

            {/* ─── Invite + add ────────────────────────────────────── */}
            <Card className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Invite code
                        </p>
                        <p className="mt-1 font-mono text-2xl font-bold text-primary-700">
                            {classroom.inviteCode}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                            <button
                                type="button"
                                onClick={copyInviteCode}
                                className="inline-flex items-center gap-1 text-primary-700 hover:text-primary-800"
                            >
                                <Copy className="h-3 w-3" strokeWidth={2} aria-hidden />
                                {copyState === "code" ? "Copied!" : "Copy code"}
                            </button>
                            <button
                                type="button"
                                onClick={copyInviteLink}
                                className="inline-flex items-center gap-1 text-primary-700 hover:text-primary-800"
                            >
                                <Copy className="h-3 w-3" strokeWidth={2} aria-hidden />
                                {copyState === "link" ? "Copied!" : "Copy invite link"}
                            </button>
                            <button
                                type="button"
                                onClick={regenerateInvite}
                                className="inline-flex items-center gap-1 text-amber-700 hover:text-amber-800"
                            >
                                <RefreshCw className="h-3 w-3" strokeWidth={2} aria-hidden />
                                Regenerate
                            </button>
                        </div>
                    </div>

                    <div className="min-w-[240px] flex-1 sm:flex-initial">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Add student by email
                        </p>
                        <div className="mt-1 flex gap-2">
                            <input
                                type="email"
                                value={emailInput}
                                onChange={(e) => setEmailInput(e.target.value)}
                                placeholder="student@example.com"
                                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                            />
                            <Button
                                variant="primary"
                                disabled={adding || !emailInput.trim()}
                                onClick={addStudent}
                            >
                                <UserPlus
                                    className="mr-1.5 h-4 w-4"
                                    strokeWidth={2}
                                    aria-hidden
                                />
                                {adding ? "Adding…" : "Add"}
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() => fileRef.current?.click()}
                                title="Bulk upload via CSV"
                            >
                                <Upload className="h-4 w-4" strokeWidth={2} aria-hidden />
                            </Button>
                            <input
                                ref={fileRef}
                                type="file"
                                accept=".csv"
                                onChange={handleCsv}
                                className="hidden"
                            />
                        </div>
                    </div>
                </div>
            </Card>

            {/* ─── Roster ──────────────────────────────────────────── */}
            <Card data-tour="class-roster" className="overflow-hidden p-0">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
                    <div className="flex items-center gap-3">
                        <h3 className="text-sm font-semibold text-slate-900">
                            Roster
                            <span className="ml-1.5 text-slate-400">
                                ({filteredStudents.length}
                                {filteredStudents.length !== data.students.length
                                    ? ` / ${data.students.length}`
                                    : ""}
                                )
                            </span>
                        </h3>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="relative">
                            <Search
                                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                                strokeWidth={2}
                                aria-hidden
                            />
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search name, email, roll #"
                                className="w-48 rounded-lg border border-slate-300 pl-8 pr-3 py-1.5 text-xs focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                            />
                        </div>
                        <select
                            value={statusFilter}
                            onChange={(e) =>
                                setStatusFilter(e.target.value as typeof statusFilter)
                            }
                            className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs focus:border-primary-500 focus:outline-none"
                        >
                            <option value="active">Active</option>
                            <option value="banned">Banned</option>
                            <option value="removed">Removed</option>
                            <option value="all">All</option>
                        </select>
                        <select
                            value={sort}
                            onChange={(e) => setSort(e.target.value as SortKey)}
                            className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs focus:border-primary-500 focus:outline-none"
                        >
                            <option value="risk">Sort: Risk (high → low)</option>
                            <option value="avg">Sort: Avg score</option>
                            <option value="coverage">Sort: Coverage</option>
                            <option value="lastActive">Sort: Last active</option>
                            <option value="name">Sort: Name</option>
                        </select>
                        <button
                            type="button"
                            onClick={exportRosterCsv}
                            disabled={data.students.length === 0}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-700 hover:border-primary-500 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                            title="Export the full roster (not just the filtered view) as CSV"
                        >
                            <Download className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                            Export CSV
                        </button>
                    </div>
                </div>

                {filteredStudents.length === 0 ? (
                    <div className="py-12 text-center text-sm text-slate-500">
                        {data.students.length === 0
                            ? "No students yet. Share the invite code or add by email."
                            : "No students match the current filters."}
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[1080px] text-sm">
                            <thead>
                                <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                    <th className="px-5 py-2.5">Student</th>
                                    <th className="px-5 py-2.5">Risk</th>
                                    <th className="px-5 py-2.5">Avg / Best</th>
                                    <th className="px-5 py-2.5">Coverage</th>
                                    <th className="px-5 py-2.5">Activity (14d)</th>
                                    <th className="px-5 py-2.5">Last active</th>
                                    <th className="px-5 py-2.5">Attempts</th>
                                    <th className="px-5 py-2.5"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredStudents.map((s) => (
                                    <RosterRow
                                        key={s.id}
                                        s={s}
                                        classAverage={insights.classAverage}
                                        onStatus={handleStatus}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            {showSettings && (
                <ClassSettingsModal
                    classroom={classroom}
                    saving={savingName}
                    onClose={() => setShowSettings(false)}
                    onSave={renameClass}
                />
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
    accent: "blue" | "emerald" | "indigo" | "rose" | "slate";
}) {
    const tones: Record<typeof accent, string> = {
        blue: "bg-blue-50 text-blue-600",
        emerald: "bg-emerald-50 text-emerald-600",
        indigo: "bg-indigo-50 text-indigo-600",
        rose: "bg-rose-50 text-rose-600",
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

function AttentionPanel({
    title,
    description,
    accent,
    students,
    showRisk,
}: {
    title: string;
    description: string;
    accent: "rose" | "amber";
    students: StudentRow[];
    showRisk: boolean;
}) {
    const tone =
        accent === "rose"
            ? "border-rose-200 bg-gradient-to-br from-rose-50/60 to-white"
            : "border-amber-200 bg-gradient-to-br from-amber-50/60 to-white";
    return (
        <Card className={`overflow-hidden p-0 ${tone}`}>
            <div className="px-5 pt-4">
                <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
                <p className="mt-0.5 text-xs text-slate-500">{description}</p>
            </div>
            <ul className="mt-2 divide-y divide-slate-100/80">
                {students.map((s) => (
                    <li key={s.id}>
                        <Link
                            href={`/teacher/students/${encodeURIComponent(s.studentId)}`}
                            className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-white/60"
                        >
                            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                                {initialsOf(s.studentName)}
                            </span>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-slate-900">
                                    {s.studentName}
                                </p>
                                <p className="truncate text-xs text-slate-500">
                                    {showRisk && s.risk.reasons.length > 0
                                        ? s.risk.reasons[0]
                                        : s.studentEmail}
                                </p>
                            </div>
                            {showRisk ? (
                                <span className="flex-shrink-0 rounded-md bg-rose-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-rose-700">
                                    Risk {s.risk.score}
                                </span>
                            ) : (
                                <span className="flex-shrink-0 rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-700">
                                    0 attempts
                                </span>
                            )}
                            <ChevronRight
                                className="h-4 w-4 flex-shrink-0 text-slate-400"
                                strokeWidth={2}
                                aria-hidden
                            />
                        </Link>
                    </li>
                ))}
            </ul>
        </Card>
    );
}

function RosterRow({
    s,
    classAverage,
    onStatus,
}: {
    s: StudentRow;
    classAverage: number | null;
    onStatus: (id: string, status: "active" | "banned" | "removed") => void;
}) {
    const riskTone: Record<RiskBand, string> = {
        low: "bg-emerald-50 text-emerald-700 ring-emerald-200",
        medium: "bg-amber-50 text-amber-700 ring-amber-200",
        high: "bg-rose-50 text-rose-700 ring-rose-200",
    };
    const avg = s.stats.averagePercentage;
    const best = s.stats.bestPercentage;
    const delta =
        avg != null && classAverage != null ? Math.round(avg - classAverage) : null;
    const topWeak = s.weakTopics[0];
    return (
        <tr className="border-b border-slate-100 hover:bg-slate-50/40">
            <td className="px-5 py-3">
                <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-semibold text-primary-700 ring-1 ring-primary-100">
                        {initialsOf(s.studentName)}
                    </span>
                    <div className="min-w-0">
                        {s.isPending ? (
                            <p className="truncate text-sm font-medium text-slate-700">
                                {s.studentName}
                                <span className="ml-1.5 rounded-md bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-700">
                                    Pending
                                </span>
                            </p>
                        ) : (
                            <Link
                                href={`/teacher/students/${encodeURIComponent(s.studentId)}`}
                                className="block truncate text-sm font-medium text-slate-900 hover:text-primary-700"
                            >
                                {s.studentName}
                            </Link>
                        )}
                        <p className="truncate text-xs text-slate-500">{s.studentEmail}</p>
                        {topWeak && (
                            <span
                                className="mt-1 inline-flex items-center rounded-md bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-700 ring-1 ring-inset ring-rose-100"
                                title={
                                    s.weakTopics
                                        .map(
                                            (t) =>
                                                `${t.category}: ${t.avgPercentage}% over ${t.attempts} attempts`
                                        )
                                        .join(" · ") || undefined
                                }
                            >
                                Weak: {topWeak.category} · {topWeak.avgPercentage}%
                            </span>
                        )}
                    </div>
                </div>
            </td>
            <td className="px-5 py-3">
                {s.stats.completedAttempts > 0 ? (
                    <span
                        className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ring-1 ring-inset ${riskTone[s.risk.band]}`}
                        title={s.risk.reasons.join(" · ")}
                    >
                        {s.risk.band} · {s.risk.score}
                    </span>
                ) : (
                    <span className="text-xs text-slate-400">—</span>
                )}
            </td>
            <td className="px-5 py-3 text-xs">
                {avg != null ? (
                    <div className="flex flex-col">
                        <span>
                            <span className="font-semibold text-slate-900">{avg}%</span>
                            <span className="ml-1 text-slate-400">
                                / {best != null ? `${best}%` : "—"}
                            </span>
                        </span>
                        {delta != null && (
                            <span
                                className={`text-[10px] font-medium ${
                                    delta > 0
                                        ? "text-emerald-600"
                                        : delta < 0
                                            ? "text-rose-600"
                                            : "text-slate-400"
                                }`}
                                title={`Class average: ${classAverage ?? "—"}%`}
                            >
                                {delta > 0 ? "+" : ""}
                                {delta} vs class
                            </span>
                        )}
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
                            style={{ width: `${s.stats.coveragePercent}%` }}
                        />
                    </div>
                    <span className="text-xs font-medium text-slate-700">
                        {s.stats.coveragePercent}%
                    </span>
                </div>
            </td>
            <td className="px-5 py-3">
                <ActivitySparkline points={s.sparkline} />
            </td>
            <td className="px-5 py-3 text-xs text-slate-500">
                {formatRelative(s.stats.lastActiveAt)}
            </td>
            <td className="px-5 py-3 text-xs text-slate-700">
                {s.stats.completedAttempts}
                {s.stats.inProgressAttempts > 0 && (
                    <span className="ml-1 text-amber-600">
                        +{s.stats.inProgressAttempts} pending
                    </span>
                )}
            </td>
            <td className="px-5 py-3 text-right">
                <div className="inline-flex items-center gap-2">
                    {!s.isPending && (
                        <Link
                            href={`/teacher/students/${encodeURIComponent(s.studentId)}`}
                            className="text-xs font-medium text-primary-700 hover:text-primary-800"
                        >
                            View →
                        </Link>
                    )}
                    {s.status === "active" ? (
                        <button
                            onClick={() => onStatus(s.studentId, "banned")}
                            className="text-xs text-amber-600 hover:text-amber-700"
                        >
                            Ban
                        </button>
                    ) : s.status === "banned" ? (
                        <button
                            onClick={() => onStatus(s.studentId, "active")}
                            className="text-xs text-emerald-600 hover:text-emerald-700"
                        >
                            Reinstate
                        </button>
                    ) : null}
                    {s.status !== "removed" && (
                        <button
                            onClick={() => onStatus(s.studentId, "removed")}
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

function ActivitySparkline({ points }: { points: number[] }) {
    if (!points || points.length === 0) {
        return <span className="text-xs text-slate-300">—</span>;
    }
    const total = points.reduce((sum, n) => sum + n, 0);
    if (total === 0) {
        return <span className="text-xs text-slate-400" title="No attempts in the last 14 days">No activity</span>;
    }
    const max = Math.max(...points, 1);
    const barW = 4;
    const gap = 2;
    const height = 24;
    const width = points.length * (barW + gap) - gap;
    return (
        <span
            className="inline-flex items-end"
            title={`${total} attempt${total === 1 ? "" : "s"} over the last 14 days`}
        >
            <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-label="14-day activity">
                {points.map((v, i) => {
                    const h = v === 0 ? 1 : Math.max(2, (v / max) * height);
                    const x = i * (barW + gap);
                    const y = height - h;
                    const isToday = i === points.length - 1;
                    return (
                        <rect
                            key={i}
                            x={x}
                            y={y}
                            width={barW}
                            height={h}
                            rx={1}
                            fill={
                                v === 0
                                    ? "#e2e8f0"
                                    : isToday
                                        ? "#0d9488"
                                        : "#5eead4"
                            }
                        />
                    );
                })}
            </svg>
        </span>
    );
}

function ClassSettingsModal({
    classroom,
    saving,
    onClose,
    onSave,
}: {
    classroom: ClassMeta;
    saving: boolean;
    onClose: () => void;
    onSave: (name: string, description: string | null) => void;
}) {
    const [name, setName] = useState(classroom.name);
    const [description, setDescription] = useState(classroom.description || "");

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
            onClick={onClose}
        >
            <Card
                className="mx-4 w-full max-w-md p-6"
                onClick={(e) => e.stopPropagation()}
            >
                <h3 className="mb-1 text-lg font-semibold text-slate-900">Class settings</h3>
                <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={80}
                    className="mb-3 w-full rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
                <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    placeholder="Description (optional)"
                    className="mb-4 w-full rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
                <div className="flex gap-2">
                    <Button
                        variant="primary"
                        className="flex-1"
                        onClick={() => onSave(name.trim(), description.trim() || null)}
                        isLoading={saving}
                        disabled={!name.trim()}
                    >
                        Save
                    </Button>
                    <Button variant="outline" onClick={onClose} disabled={saving}>
                        Cancel
                    </Button>
                </div>
            </Card>
        </div>
    );
}

// ─── Helpers ──────────────────────────────────────────────────────────

function initialsOf(name: string): string {
    return name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0]?.toUpperCase() || "")
        .join("");
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
