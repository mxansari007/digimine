"use client";

/**
 * Institute admin → Students page.
 *
 * Bulk-pre-register student emails. For each email:
 *   - Existing student account → silently attached, instituteId stamped
 *     on their user doc
 *   - Existing non-student account → skipped with reason
 *   - New email → pending invite; auto-attaches when the student signs up
 *     with that email (no claim link needed — the auto-attach hook in
 *     the signup flow handles it)
 *
 * Mirror of /institute/teachers minus the claim-link concept.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card } from "@digimine/ui";
import {
    Users,
    UserPlus,
    Mail,
    Check,
    AlertTriangle,
    Clock,
    Trash2,
} from "lucide-react";
import { useAuthContext } from "@/contexts/AuthContext";
import { teacherFetch } from "@/lib/api/teacherFetch";
import { HelpTutorial } from "@/components/help/HelpTutorial";
import { TUTORIALS } from "@/components/help/tutorials";

type StudentRow = {
    id: string;
    studentId: string;
    email: string;
    name: string | null;
    status: "invited" | "active" | "removed";
    invitedAt: string | null;
    joinedAt: string | null;
};

type BulkResultRow = {
    email: string;
    outcome: "attached" | "invited" | "skipped";
    studentId?: string;
    reason?: string;
    message?: string;
};

type BulkResponse = {
    summary: { attached: number; invited: number; skipped: number; invalid: number };
    results: BulkResultRow[];
};

export default function InstituteStudentsPage() {
    const { firebaseUser } = useAuthContext();
    const [instituteId, setInstituteId] = useState("");
    const [students, setStudents] = useState<StudentRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const [bulkText, setBulkText] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [lastResults, setLastResults] = useState<BulkResponse | null>(null);

    const loadAll = useCallback(async () => {
        if (!firebaseUser) return;
        setLoading(true);
        setError("");
        try {
            const meRes = await teacherFetch(firebaseUser, "/api/institute/me");
            const meData = await meRes.json();
            const id = meData?.institute?.id;
            if (!id) throw new Error("No institute found for your account.");
            setInstituteId(id);
            const res = await teacherFetch(
                firebaseUser,
                `/api/institute/${encodeURIComponent(id)}/students`
            );
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to load students.");
            setStudents(data.students || []);
        } catch (err) {
            setError((err as Error)?.message || "Failed to load students");
        } finally {
            setLoading(false);
        }
    }, [firebaseUser]);

    useEffect(() => {
        loadAll();
    }, [loadAll]);

    const parsedEmails = useMemo(() => parseEmails(bulkText), [bulkText]);

    const handleBulkSubmit = async () => {
        if (!firebaseUser || !instituteId || parsedEmails.length === 0) return;
        setSubmitting(true);
        setLastResults(null);
        try {
            const res = await teacherFetch(
                firebaseUser,
                `/api/institute/${encodeURIComponent(instituteId)}/students/bulk`,
                {
                    method: "POST",
                    body: JSON.stringify({ emails: parsedEmails }),
                }
            );
            const data: BulkResponse = await res.json();
            if (!res.ok) throw new Error((data as unknown as { error?: string })?.error || "Failed");
            setLastResults(data);
            setBulkText("");
            await loadAll();
        } catch (err) {
            alert((err as Error)?.message || "Failed to invite students");
        } finally {
            setSubmitting(false);
        }
    };

    const handleRemove = async (row: StudentRow) => {
        if (!firebaseUser) return;
        if (!confirm(`Remove ${row.email} from this institute?`)) return;
        try {
            const res = await teacherFetch(
                firebaseUser,
                `/api/institute/${encodeURIComponent(instituteId)}/students?id=${encodeURIComponent(row.id)}`,
                { method: "DELETE" }
            );
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Failed");
            }
            await loadAll();
        } catch (err) {
            alert((err as Error)?.message);
        }
    };

    const counts = useMemo(() => {
        let active = 0, invited = 0;
        for (const s of students) {
            if (s.status === "active") active += 1;
            else if (s.status === "invited") invited += 1;
        }
        return { active, invited };
    }, [students]);

    if (loading) {
        return (
            <div className="space-y-4">
                <div className="h-8 w-48 animate-pulse rounded bg-slate-200" />
                <div className="grid gap-4 md:grid-cols-3">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="h-28 animate-pulse rounded-xl bg-slate-100" />
                    ))}
                </div>
                <div className="h-48 animate-pulse rounded-xl bg-slate-100" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <div className="flex items-center gap-1.5">
                        <h1 className="text-2xl font-bold text-slate-900">Students</h1>
                        <HelpTutorial {...TUTORIALS.institute_students} />
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                        Pre-register student emails. They&apos;ll auto-attach to your
                        institute the moment they sign up.
                    </p>
                </div>
            </div>

            {error && (
                <Card className="border-rose-200 dark:border-rose-500/25 bg-rose-50 dark:bg-rose-500/10 p-4 text-sm text-rose-700 dark:text-rose-300">
                    {error}
                </Card>
            )}

            {/* Insight cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <InsightCard
                    Icon={Users}
                    label="Active students"
                    value={String(counts.active)}
                    sub="signed up + linked"
                    accent="emerald"
                />
                <InsightCard
                    Icon={Clock}
                    label="Pre-registered"
                    value={String(counts.invited)}
                    sub={counts.invited > 0 ? "waiting to sign up" : "no pending invites"}
                    accent={counts.invited > 0 ? "amber" : "slate"}
                />
                <InsightCard
                    Icon={UserPlus}
                    label="Total on roster"
                    value={String(students.length)}
                    sub="institute-linked emails"
                    accent="blue"
                />
            </div>

            {/* Bulk add card */}
            <Card className="overflow-hidden p-0">
                <div className="border-b border-slate-100 px-6 py-4">
                    <h3 className="text-sm font-semibold text-slate-900">
                        Add students in bulk
                    </h3>
                    <p className="mt-0.5 text-xs text-slate-500">
                        Paste a list of emails — one per line, or separated by commas /
                        spaces. Students sign up with the same email, and they&apos;ll
                        automatically appear under your institute.
                    </p>
                </div>
                <div className="p-6">
                    <textarea
                        data-tour="bulk-students-textarea"
                        value={bulkText}
                        onChange={(e) => setBulkText(e.target.value)}
                        rows={5}
                        placeholder={
                            "student1@example.com\nstudent2@example.com\nfresher@college.edu, batch26@college.edu"
                        }
                        className="w-full resize-none rounded-xl border border-slate-300 bg-white p-3 font-mono text-sm shadow-sm transition-all focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                        disabled={submitting}
                    />
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs text-slate-500">
                            {parsedEmails.length === 0
                                ? "Paste emails above to begin."
                                : `${parsedEmails.length} valid email${parsedEmails.length === 1 ? "" : "s"} detected`}
                        </p>
                        <Button
                            data-tour="bulk-students-submit"
                            variant="primary"
                            onClick={handleBulkSubmit}
                            isLoading={submitting}
                            disabled={submitting || parsedEmails.length === 0}
                        >
                            <UserPlus className="mr-1.5 h-4 w-4" strokeWidth={2} aria-hidden />
                            Add {parsedEmails.length || ""} student
                            {parsedEmails.length === 1 ? "" : "s"}
                        </Button>
                    </div>
                </div>
                {lastResults && (
                    <div className="border-t border-slate-100 bg-slate-50/60 px-6 py-4">
                        <ResultSummary summary={lastResults.summary} results={lastResults.results} />
                    </div>
                )}
            </Card>

            {/* Roster */}
            <Card data-tour="student-roster" className="overflow-hidden p-0">
                <div className="border-b border-slate-100 px-6 py-3">
                    <h3 className="text-sm font-semibold text-slate-900">
                        Roster
                        <span className="ml-1.5 text-slate-400">({students.length})</span>
                    </h3>
                </div>
                {students.length === 0 ? (
                    <div className="space-y-3 py-12 text-center text-sm text-slate-500">
                        <p>No students yet.</p>
                        <button
                            type="button"
                            onClick={() => {
                                const el = document.querySelector<HTMLTextAreaElement>(
                                    '[data-tour="bulk-students-textarea"]'
                                );
                                if (el) {
                                    el.scrollIntoView({ behavior: "smooth", block: "center" });
                                    el.focus();
                                }
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-primary-700"
                        >
                            Pre-register your first student
                        </button>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[640px] text-sm">
                            <thead>
                                <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                    <th className="px-6 py-2.5">Student</th>
                                    <th className="px-6 py-2.5">Status</th>
                                    <th className="px-6 py-2.5">Pre-registered</th>
                                    <th className="px-6 py-2.5">Joined</th>
                                    <th className="px-6 py-2.5"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {students.map((s) => (
                                    <RosterRow key={s.id} row={s} onRemove={() => handleRemove(s)} />
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>
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
    accent: "emerald" | "amber" | "blue" | "slate";
}) {
    const tones: Record<typeof accent, string> = {
        emerald: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
        amber: "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-300",
        blue: "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-300",
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

function ResultSummary({
    summary,
    results,
}: {
    summary: BulkResponse["summary"];
    results: BulkResultRow[];
}) {
    return (
        <div className="space-y-3">
            <p className="text-sm font-semibold text-slate-900">
                Done.{" "}
                <span className="font-normal text-slate-600">
                    {summary.attached > 0 && (
                        <>
                            <span className="text-emerald-700">{summary.attached} attached</span>
                            {(summary.invited > 0 || summary.skipped > 0) && " · "}
                        </>
                    )}
                    {summary.invited > 0 && (
                        <>
                            <span className="text-amber-700">
                                {summary.invited} pre-registered
                            </span>
                            {summary.skipped > 0 && " · "}
                        </>
                    )}
                    {summary.skipped > 0 && (
                        <span className="text-slate-500">{summary.skipped} skipped</span>
                    )}
                </span>
            </p>
            <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 bg-white">
                {results.map((r, i) => (
                    <li key={`${r.email}-${i}`} className="flex items-center gap-3 px-4 py-2.5">
                        {r.outcome === "attached" ? (
                            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                                <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
                            </span>
                        ) : r.outcome === "invited" ? (
                            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300">
                                <Mail className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                            </span>
                        ) : (
                            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                                <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                            </span>
                        )}
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-slate-900">
                                {r.email}
                            </p>
                            <p className="truncate text-xs text-slate-500">
                                {r.message ||
                                    (r.outcome === "attached"
                                        ? "Linked to your institute"
                                        : r.outcome === "invited"
                                          ? "Pre-registered"
                                          : "Skipped")}
                            </p>
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
}

function RosterRow({
    row,
    onRemove,
}: {
    row: StudentRow;
    onRemove: () => void;
}) {
    const statusTone =
        row.status === "active"
            ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-200 dark:ring-emerald-500/25"
            : row.status === "invited"
              ? "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-amber-200 dark:ring-amber-500/25"
              : "bg-slate-100 text-slate-600 ring-slate-200";
    return (
        <tr className="border-b border-slate-100 hover:bg-slate-50/40">
            <td className="px-6 py-3">
                <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary-50 dark:bg-primary-500/10 text-xs font-semibold text-primary-700 dark:text-primary-300 ring-1 ring-primary-100 dark:ring-primary-500/25">
                        {initialsOf(row.name || row.email)}
                    </span>
                    <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">
                            {row.name || row.email.split("@")[0]}
                        </p>
                        <p className="truncate text-xs text-slate-500">{row.email}</p>
                    </div>
                </div>
            </td>
            <td className="px-6 py-3">
                <span
                    className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ring-1 ring-inset ${statusTone}`}
                >
                    {row.status === "invited" ? "pending" : row.status}
                </span>
            </td>
            <td className="px-6 py-3 text-xs text-slate-500">{formatDate(row.invitedAt)}</td>
            <td className="px-6 py-3 text-xs text-slate-500">{formatDate(row.joinedAt)}</td>
            <td className="px-6 py-3 text-right">
                <button
                    type="button"
                    onClick={onRemove}
                    className="inline-flex items-center gap-1 text-xs text-rose-600 hover:text-rose-700"
                >
                    <Trash2 className="h-3 w-3" strokeWidth={2} aria-hidden />
                    Remove
                </button>
            </td>
        </tr>
    );
}

function parseEmails(text: string): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const raw of text.split(/[\s,;]+/)) {
        const e = raw.trim().toLowerCase();
        if (!e) continue;
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) continue;
        if (seen.has(e)) continue;
        seen.add(e);
        out.push(e);
    }
    return out;
}

function initialsOf(value: string): string {
    return (
        value
            .replace(/@.*/, "")
            .split(/[\s._-]+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((p) => p[0]?.toUpperCase() || "")
            .join("") || "?"
    );
}

function formatDate(value?: string | null) {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
