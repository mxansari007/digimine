"use client";

/**
 * Institute admin → Teachers page.
 *
 * Two modes of adding teachers:
 *   1. Bulk paste — paste a list of emails (one per line / comma- / space-
 *      separated). Server-side per-email outcome: "attached" (silently
 *      linked existing teacher), "invited" (new — returns a claim URL the
 *      admin can copy), or "skipped" (with reason).
 *   2. Status changes on existing rows (remove / reinstate).
 *
 * What replaces the old single-email form:
 *   - The old page only invited one teacher at a time and provided no way
 *     to send the invite link out (it just sat there waiting for the
 *     teacher to know an invite code).
 *   - The new bulk endpoint generates a `claimToken` per invited row.
 *     This page surfaces "Copy claim link" buttons on every pending row so
 *     the admin can paste them into Slack/email/whatever.
 *
 * Layout matches the class command-center: insight cards on top, primary
 * action card in the middle, roster table at the bottom.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button, Card } from "@digimine/ui";
import {
    Users,
    UserPlus,
    Mail,
    Check,
    AlertTriangle,
    Copy,
    Clock,
    Trash2,
    RotateCcw,
} from "lucide-react";
import { useAuthContext } from "@/contexts/AuthContext";
import { teacherFetch } from "@/lib/api/teacherFetch";
import { HelpTutorial } from "@/components/help/HelpTutorial";
import { TUTORIALS } from "@/components/help/tutorials";

type TeacherRow = {
    id: string;
    teacherId: string;
    email: string;
    name: string | null;
    status: "invited" | "active" | "removed";
    invitedAt: string | null;
    joinedAt: string | null;
    /** Available on invited rows when the bulk endpoint stamped it. */
    claimToken?: string | null;
};

type BulkResultRow = {
    email: string;
    outcome: "attached" | "invited" | "skipped";
    teacherId?: string;
    claimToken?: string;
    claimUrl?: string;
    reason?: string;
    message?: string;
};

type BulkResponse = {
    summary: {
        attached: number;
        invited: number;
        skipped: number;
        invalid: number;
        seatsRemaining: number;
    };
    results: BulkResultRow[];
};

export default function InstituteTeachersPage() {
    const { firebaseUser } = useAuthContext();
    const [instituteId, setInstituteId] = useState("");
    const [teachers, setTeachers] = useState<TeacherRow[]>([]);
    const [seats, setSeats] = useState(5);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    // Bulk-invite UI state
    const [bulkText, setBulkText] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [lastResults, setLastResults] = useState<BulkResponse | null>(null);
    const [copiedToken, setCopiedToken] = useState<string | null>(null);

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
            setSeats(meData.institute?.subscription?.seats || 5);
            const res = await teacherFetch(
                firebaseUser,
                `/api/institute/${encodeURIComponent(id)}/teachers`
            );
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to load roster.");
            setTeachers(data.teachers || []);
        } catch (err) {
            setError((err as Error)?.message || "Failed to load teachers");
        } finally {
            setLoading(false);
        }
    }, [firebaseUser]);

    useEffect(() => {
        loadAll();
    }, [loadAll]);

    // ─── Bulk invite ──────────────────────────────────────────────────

    const parsedEmails = useMemo(() => parseEmails(bulkText), [bulkText]);

    const handleBulkSubmit = async () => {
        if (!firebaseUser || !instituteId || parsedEmails.length === 0) return;
        setSubmitting(true);
        setLastResults(null);
        try {
            const res = await teacherFetch(
                firebaseUser,
                `/api/institute/${encodeURIComponent(instituteId)}/teachers/bulk`,
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
            alert((err as Error)?.message || "Failed to invite teachers");
        } finally {
            setSubmitting(false);
        }
    };

    // ─── Status mutations ─────────────────────────────────────────────

    const handleStatusChange = async (
        row: TeacherRow,
        next: TeacherRow["status"]
    ) => {
        if (!firebaseUser) return;
        if (next === "removed" && !confirm(`Remove ${row.email} from this institute?`))
            return;
        try {
            const res = await teacherFetch(
                firebaseUser,
                `/api/institute/${encodeURIComponent(instituteId)}/teachers/${encodeURIComponent(row.id)}`,
                { method: "PATCH", body: JSON.stringify({ status: next }) }
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

    const copyClaimLink = (token: string) => {
        const url = `${window.location.origin}/claim/${token}`;
        navigator.clipboard.writeText(url);
        setCopiedToken(token);
        setTimeout(() => setCopiedToken((c) => (c === token ? null : c)), 1500);
    };

    // ─── Derived counts ───────────────────────────────────────────────

    const counts = useMemo(() => {
        let active = 0,
            invited = 0,
            removed = 0;
        for (const t of teachers) {
            if (t.status === "active") active += 1;
            else if (t.status === "invited") invited += 1;
            else if (t.status === "removed") removed += 1;
        }
        return { active, invited, removed, used: active + invited };
    }, [teachers]);

    if (loading) {
        return (
            <div className="space-y-4">
                <div className="h-8 w-48 animate-pulse rounded bg-slate-200" />
                <div className="grid gap-4 md:grid-cols-4">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="h-28 animate-pulse rounded-xl bg-slate-100" />
                    ))}
                </div>
                <div className="h-48 animate-pulse rounded-xl bg-slate-100" />
                <div className="h-96 animate-pulse rounded-xl bg-slate-100" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <div className="flex items-center gap-1.5">
                        <h1 className="text-2xl font-bold text-slate-900">Teachers</h1>
                        <HelpTutorial {...TUTORIALS.institute_teachers} />
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                        Add teachers in bulk by email. Existing accounts are linked
                        instantly; new emails get a one-time setup link.
                    </p>
                </div>
                <Link href="/institute/classes">
                    <Button variant="outline">Manage classes →</Button>
                </Link>
            </div>

            {error && (
                <Card className="border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                    {error}
                </Card>
            )}

            {/* ─── Insight cards ───────────────────────────────────── */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <InsightCard
                    Icon={Users}
                    label="Active teachers"
                    value={String(counts.active)}
                    sub={`of ${seats} seats`}
                    accent="emerald"
                />
                <InsightCard
                    Icon={Clock}
                    label="Pending claims"
                    value={String(counts.invited)}
                    sub={counts.invited > 0 ? "haven't accepted yet" : "no open invites"}
                    accent={counts.invited > 0 ? "amber" : "slate"}
                />
                <InsightCard
                    Icon={UserPlus}
                    label="Seats available"
                    value={String(Math.max(0, seats - counts.used))}
                    sub={`${seats} total in plan`}
                    accent={seats - counts.used <= 0 ? "rose" : "blue"}
                />
                <InsightCard
                    Icon={Trash2}
                    label="Removed"
                    value={String(counts.removed)}
                    sub="left the institute"
                    accent="slate"
                />
            </div>

            {/* ─── Bulk add ────────────────────────────────────────── */}
            <Card className="overflow-hidden p-0">
                <div className="border-b border-slate-100 px-6 py-4">
                    <h3 className="text-sm font-semibold text-slate-900">
                        Add teachers in bulk
                    </h3>
                    <p className="mt-0.5 text-xs text-slate-500">
                        Paste a list of emails — one per line, or separated by commas /
                        spaces. Up to 200 at a time.
                    </p>
                </div>
                <div className="p-6">
                    <textarea
                        data-tour="bulk-emails-textarea"
                        value={bulkText}
                        onChange={(e) => setBulkText(e.target.value)}
                        rows={5}
                        placeholder={
                            "anita@example.com\nrohan@example.com\nteam@yourinstitute.in, vidya@vidya.in"
                        }
                        className="w-full resize-none rounded-xl border border-slate-300 bg-white p-3 font-mono text-sm shadow-sm transition-all focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                        disabled={submitting}
                    />
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs text-slate-500">
                            {parsedEmails.length === 0 ? (
                                <span>Paste emails above to begin.</span>
                            ) : (
                                <>
                                    <span className="font-semibold text-slate-700">
                                        {parsedEmails.length}
                                    </span>{" "}
                                    valid email{parsedEmails.length === 1 ? "" : "s"} detected
                                </>
                            )}
                        </p>
                        <Button
                            data-tour="bulk-submit"
                            variant="primary"
                            onClick={handleBulkSubmit}
                            isLoading={submitting}
                            disabled={submitting || parsedEmails.length === 0}
                        >
                            <UserPlus className="mr-1.5 h-4 w-4" strokeWidth={2} aria-hidden />
                            Add {parsedEmails.length || ""} teacher{parsedEmails.length === 1 ? "" : "s"}
                        </Button>
                    </div>
                </div>

                {lastResults && (
                    <div className="border-t border-slate-100 bg-slate-50/60 px-6 py-4">
                        <BulkResultSummary
                            summary={lastResults.summary}
                            results={lastResults.results}
                            onCopy={copyClaimLink}
                            copiedToken={copiedToken}
                        />
                    </div>
                )}
            </Card>

            {/* ─── Roster ──────────────────────────────────────────── */}
            <Card data-tour="teacher-roster" className="overflow-hidden p-0">
                <div className="border-b border-slate-100 px-6 py-3">
                    <h3 className="text-sm font-semibold text-slate-900">
                        Roster
                        <span className="ml-1.5 text-slate-400">({teachers.length})</span>
                    </h3>
                </div>
                {teachers.length === 0 ? (
                    <div className="space-y-3 py-12 text-center text-sm text-slate-500">
                        <p>No teachers yet.</p>
                        <button
                            type="button"
                            onClick={() => {
                                const el = document.querySelector<HTMLTextAreaElement>(
                                    '[data-tour="bulk-emails-textarea"]'
                                );
                                if (el) {
                                    el.scrollIntoView({ behavior: "smooth", block: "center" });
                                    el.focus();
                                }
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-primary-700"
                        >
                            Add your first teacher
                        </button>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[760px] text-sm">
                            <thead>
                                <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                    <th className="px-6 py-2.5">Teacher</th>
                                    <th className="px-6 py-2.5">Status</th>
                                    <th className="px-6 py-2.5">Invited</th>
                                    <th className="px-6 py-2.5">Joined</th>
                                    <th className="px-6 py-2.5"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {teachers.map((row) => (
                                    <RosterRow
                                        key={row.id}
                                        row={row}
                                        onCopyLink={copyClaimLink}
                                        onStatus={handleStatusChange}
                                        copiedToken={copiedToken}
                                    />
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
    accent: "emerald" | "amber" | "blue" | "rose" | "slate";
}) {
    const tones: Record<typeof accent, string> = {
        emerald: "bg-emerald-50 text-emerald-600",
        amber: "bg-amber-50 text-amber-600",
        blue: "bg-blue-50 text-blue-600",
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

function BulkResultSummary({
    summary,
    results,
    onCopy,
    copiedToken,
}: {
    summary: BulkResponse["summary"];
    results: BulkResultRow[];
    onCopy: (token: string) => void;
    copiedToken: string | null;
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
                            <span className="text-amber-700">{summary.invited} invited</span>
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
                        <ResultIcon outcome={r.outcome} />
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-slate-900">
                                {r.email}
                            </p>
                            <p className="truncate text-xs text-slate-500">
                                {r.message ||
                                    (r.outcome === "attached"
                                        ? "Linked to your institute"
                                        : r.outcome === "invited"
                                          ? "Pending"
                                          : "Skipped")}
                            </p>
                        </div>
                        {r.outcome === "invited" && r.claimToken && (
                            <button
                                type="button"
                                onClick={() => onCopy(r.claimToken!)}
                                className="inline-flex items-center gap-1 rounded-md border border-primary-200 bg-white px-2.5 py-1 text-xs font-medium text-primary-700 transition-colors hover:bg-primary-50"
                            >
                                <Copy className="h-3 w-3" strokeWidth={2} aria-hidden />
                                {copiedToken === r.claimToken ? "Copied!" : "Copy link"}
                            </button>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    );
}

function ResultIcon({ outcome }: { outcome: BulkResultRow["outcome"] }) {
    if (outcome === "attached") {
        return (
            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
            </span>
        );
    }
    if (outcome === "invited") {
        return (
            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                <Mail className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
            </span>
        );
    }
    return (
        <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
            <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
        </span>
    );
}

function RosterRow({
    row,
    onCopyLink,
    onStatus,
    copiedToken,
}: {
    row: TeacherRow;
    onCopyLink: (token: string) => void;
    onStatus: (row: TeacherRow, next: TeacherRow["status"]) => void;
    copiedToken: string | null;
}) {
    const statusTone =
        row.status === "active"
            ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
            : row.status === "invited"
              ? "bg-amber-50 text-amber-700 ring-amber-200"
              : "bg-slate-100 text-slate-600 ring-slate-200";

    return (
        <tr className="border-b border-slate-100 hover:bg-slate-50/40">
            <td className="px-6 py-3">
                <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-semibold text-primary-700 ring-1 ring-primary-100">
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
                    {row.status}
                </span>
            </td>
            <td className="px-6 py-3 text-xs text-slate-500">
                {formatDate(row.invitedAt)}
            </td>
            <td className="px-6 py-3 text-xs text-slate-500">
                {formatDate(row.joinedAt)}
            </td>
            <td className="px-6 py-3 text-right">
                <div className="inline-flex items-center gap-2.5">
                    {row.status === "invited" && row.claimToken && (
                        <button
                            type="button"
                            onClick={() => onCopyLink(row.claimToken!)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-primary-700 hover:text-primary-800"
                        >
                            <Copy className="h-3 w-3" strokeWidth={2} aria-hidden />
                            {copiedToken === row.claimToken ? "Copied!" : "Copy link"}
                        </button>
                    )}
                    {row.status === "removed" ? (
                        <button
                            type="button"
                            onClick={() => onStatus(row, "active")}
                            className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700"
                        >
                            <RotateCcw className="h-3 w-3" strokeWidth={2} aria-hidden />
                            Reinstate
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={() => onStatus(row, "removed")}
                            className="inline-flex items-center gap-1 text-xs text-rose-600 hover:text-rose-700"
                        >
                            <Trash2 className="h-3 w-3" strokeWidth={2} aria-hidden />
                            Remove
                        </button>
                    )}
                </div>
            </td>
        </tr>
    );
}

// ─── Helpers ──────────────────────────────────────────────────────────

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
            .replace(/@.*/, "") // strip email domain if no name
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
