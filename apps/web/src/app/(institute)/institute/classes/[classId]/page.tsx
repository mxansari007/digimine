"use client";

/**
 * Institute → Class detail.
 *
 * The piece the institute portal was missing: a per-class roster page
 * where an admin can see who's in a class, ADD students from the
 * institute's attached-student pool (institutes/{id}/student_invites
 * with status="active"), and REMOVE students from that one class
 * (without dropping them from the institute).
 *
 * The /institute/classes card now routes here on click. Subject +
 * teacher management still lives on /institute/classes — this page
 * shows them read-only so the admin has full context.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button, Card } from "@digimine/ui";
import {
    ArrowLeft,
    BookOpen,
    Copy,
    Search,
    UserPlus,
    UserMinus,
    Users,
} from "lucide-react";
import { useAuthContext } from "@/contexts/AuthContext";
import { teacherFetch } from "@/lib/api/teacherFetch";
import { HelpTutorial } from "@/components/help/HelpTutorial";
import { TUTORIALS } from "@/components/help/tutorials";

type ClassMeta = {
    id: string;
    name: string;
    description: string | null;
    teacherId: string;
    inviteCode: string;
    studentsCount: number;
    activeStudentsCount: number;
    isArchived: boolean;
    instituteId?: string;
};

type Subject = {
    id: string;
    name: string;
    teacherId: string;
    teacherName: string;
    teacherEmail: string;
    order: number;
};

type ClassStudent = {
    id: string;
    studentId: string;
    studentEmail: string;
    studentName: string;
    rollNumber: string | null;
    status: "active" | "banned" | "removed";
    enrolledAt: string | null;
    isPending: boolean;
};

type InstituteStudent = {
    id: string;
    studentId: string;
    email: string;
    name: string | null;
    status: "invited" | "active";
    invitedAt: string | null;
    joinedAt: string | null;
};

export default function InstituteClassDetailPage() {
    const params = useParams();
    const classId = params.classId as string;
    const { firebaseUser } = useAuthContext();
    const [instituteId, setInstituteId] = useState("");
    const [classMeta, setClassMeta] = useState<ClassMeta | null>(null);
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [classStudents, setClassStudents] = useState<ClassStudent[]>([]);
    const [allStudents, setAllStudents] = useState<InstituteStudent[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [showPicker, setShowPicker] = useState(false);

    const load = useCallback(async () => {
        if (!firebaseUser) return;
        setLoading(true);
        setError("");
        try {
            const meRes = await teacherFetch(firebaseUser, "/api/institute/me");
            const meData = await meRes.json();
            const id = meData?.institute?.id;
            if (!id) throw new Error("No institute");
            setInstituteId(id);

            const [classRes, subjectsRes, studentsRes, instituteStudentsRes] =
                await Promise.all([
                    teacherFetch(
                        firebaseUser,
                        `/api/institute/${encodeURIComponent(id)}/classes/${encodeURIComponent(classId)}`
                    ),
                    teacherFetch(
                        firebaseUser,
                        `/api/institute/${encodeURIComponent(id)}/classes/${encodeURIComponent(classId)}/subjects`
                    ),
                    teacherFetch(
                        firebaseUser,
                        `/api/institute/${encodeURIComponent(id)}/classes/${encodeURIComponent(classId)}/students`
                    ),
                    teacherFetch(
                        firebaseUser,
                        `/api/institute/${encodeURIComponent(id)}/students`
                    ),
                ]);
            const classData = await classRes.json();
            const subjectsData = await subjectsRes.json();
            const studentsData = await studentsRes.json();
            const instituteStudentsData = await instituteStudentsRes.json();
            if (!classRes.ok) throw new Error(classData.error || "Failed to load class");
            if (!subjectsRes.ok) throw new Error(subjectsData.error || "Failed to load subjects");
            if (!studentsRes.ok) throw new Error(studentsData.error || "Failed to load roster");
            if (!instituteStudentsRes.ok)
                throw new Error(instituteStudentsData.error || "Failed to load institute students");

            setClassMeta(classData.class);
            setSubjects(subjectsData.subjects || []);
            setClassStudents(studentsData.students || []);
            setAllStudents(instituteStudentsData.students || []);
        } catch (err) {
            setError((err as Error)?.message || "Failed to load class.");
        } finally {
            setLoading(false);
        }
    }, [firebaseUser, classId]);

    useEffect(() => {
        load();
    }, [load]);

    const addStudent = useCallback(
        async (inviteId: string) => {
            if (!firebaseUser || !instituteId) return;
            try {
                const res = await teacherFetch(
                    firebaseUser,
                    `/api/institute/${encodeURIComponent(instituteId)}/classes/${encodeURIComponent(classId)}/students`,
                    {
                        method: "POST",
                        body: JSON.stringify({ studentInviteId: inviteId }),
                    }
                );
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Failed to add student");
                await load();
            } catch (err) {
                alert((err as Error)?.message);
            }
        },
        [firebaseUser, instituteId, classId, load]
    );

    const removeStudent = useCallback(
        async (studentId: string, name: string) => {
            if (!firebaseUser || !instituteId) return;
            if (
                !confirm(
                    `Remove ${name} from this class? They will still be in the institute.`
                )
            ) {
                return;
            }
            try {
                const res = await teacherFetch(
                    firebaseUser,
                    `/api/institute/${encodeURIComponent(instituteId)}/classes/${encodeURIComponent(classId)}/students/${encodeURIComponent(studentId)}`,
                    { method: "DELETE" }
                );
                if (!res.ok) {
                    const data = await res.json();
                    throw new Error(data.error || "Failed to remove");
                }
                await load();
            } catch (err) {
                alert((err as Error)?.message);
            }
        },
        [firebaseUser, instituteId, classId, load]
    );

    const enrolledStudentIds = useMemo(
        () =>
            new Set(
                classStudents
                    .filter((s) => s.status === "active")
                    .map((s) => s.studentId)
            ),
        [classStudents]
    );

    const eligibleInstituteStudents = useMemo(() => {
        return allStudents.filter(
            (s) => s.status === "active" && !enrolledStudentIds.has(s.studentId)
        );
    }, [allStudents, enrolledStudentIds]);

    const visibleRoster = useMemo(
        () => classStudents.filter((s) => s.status === "active"),
        [classStudents]
    );

    if (loading) {
        return (
            <div className="space-y-4 py-8">
                <div className="h-8 w-64 animate-pulse rounded bg-slate-200" />
                <div className="h-32 animate-pulse rounded-xl bg-slate-100" />
                <div className="h-96 animate-pulse rounded-xl bg-slate-100" />
            </div>
        );
    }

    if (error || !classMeta) {
        return (
            <Card className="p-8 text-center text-rose-700">
                {error || "Class not found."}
                <Link
                    href="/institute/classes"
                    className="ml-2 text-primary-700 underline"
                >
                    Back to classes
                </Link>
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <Link
                    href="/institute/classes"
                    className="inline-flex items-center gap-1 text-sm text-primary-700 hover:text-primary-800"
                >
                    <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                    Back to classes
                </Link>
                <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <div className="flex items-center gap-1.5">
                            <h1 className="text-2xl font-bold text-slate-900">
                                {classMeta.name}
                            </h1>
                            <HelpTutorial {...TUTORIALS.institute_class_detail} />
                            {classMeta.isArchived && (
                                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                                    Archived
                                </span>
                            )}
                        </div>
                        {classMeta.description && (
                            <p className="mt-1 max-w-2xl text-sm text-slate-500">
                                {classMeta.description}
                            </p>
                        )}
                    </div>
                    {!classMeta.isArchived && (
                        <Button
                            variant="primary"
                            onClick={() => setShowPicker(true)}
                            disabled={allStudents.length === 0}
                            title={
                                allStudents.length === 0
                                    ? "Pre-register students on the Students page first"
                                    : undefined
                            }
                        >
                            <UserPlus
                                className="mr-1.5 h-4 w-4"
                                strokeWidth={2}
                                aria-hidden
                            />
                            Add students
                        </Button>
                    )}
                </div>
            </div>

            {/* ─── Summary cards ──────────────────────────────────── */}
            <div className="grid gap-4 sm:grid-cols-3">
                <Card className="p-5">
                    <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <Users className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                        Active students
                    </p>
                    <p className="mt-2 text-3xl font-bold text-slate-900">
                        {classMeta.activeStudentsCount}
                        <span className="ml-1 text-base font-normal text-slate-400">
                            / {classMeta.studentsCount}
                        </span>
                    </p>
                </Card>
                <Card className="p-5">
                    <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <BookOpen className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                        Subjects
                    </p>
                    <p className="mt-2 text-3xl font-bold text-slate-900">
                        {subjects.length}
                    </p>
                    <Link
                        href="/institute/classes"
                        className="mt-1 text-xs text-primary-700 hover:text-primary-800"
                    >
                        Manage subjects →
                    </Link>
                </Card>
                <Card className="p-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Invite code
                    </p>
                    <p className="mt-2 font-mono text-xl font-bold text-primary-700">
                        {classMeta.inviteCode}
                    </p>
                    <button
                        type="button"
                        onClick={() => {
                            navigator.clipboard.writeText(
                                `${window.location.origin}/join/${classMeta.inviteCode}`
                            );
                        }}
                        className="mt-1 inline-flex items-center gap-1 text-xs text-primary-700 hover:text-primary-800"
                    >
                        <Copy className="h-3 w-3" strokeWidth={2} aria-hidden />
                        Copy invite link
                    </button>
                </Card>
            </div>

            {/* ─── Subjects strip ────────────────────────────────── */}
            <Card className="p-5">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-slate-900">
                        Subjects &amp; teachers
                    </h2>
                    <Link
                        href="/institute/classes"
                        className="text-xs text-primary-700 hover:text-primary-800"
                    >
                        Edit on classes page →
                    </Link>
                </div>
                {subjects.length === 0 ? (
                    <p className="mt-2 rounded-lg bg-slate-50 px-3 py-3 text-xs text-slate-500">
                        No subjects assigned yet. Without a teacher you can&apos;t add
                        students — assign one from the Classes page first.
                    </p>
                ) : (
                    <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                        {subjects.map((s) => (
                            <li
                                key={s.id}
                                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2"
                            >
                                <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-300">
                                    <BookOpen
                                        className="h-3.5 w-3.5"
                                        strokeWidth={2}
                                        aria-hidden
                                    />
                                </span>
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-medium text-slate-900">
                                        {s.name}
                                    </p>
                                    <p className="truncate text-xs text-slate-500">
                                        {s.teacherName || s.teacherEmail}
                                    </p>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </Card>

            {/* ─── Roster ──────────────────────────────────────────── */}
            <Card data-tour="institute-class-roster" className="overflow-hidden p-0">
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
                    <h2 className="text-sm font-semibold text-slate-900">
                        Roster
                        <span className="ml-1.5 text-slate-400">
                            ({visibleRoster.length})
                        </span>
                    </h2>
                </div>
                {visibleRoster.length === 0 ? (
                    <div className="space-y-2 py-12 text-center text-sm text-slate-500">
                        <p>No students in this class yet.</p>
                        {allStudents.length === 0 ? (
                            <p className="text-xs">
                                Pre-register students on the{" "}
                                <Link
                                    href="/institute/students"
                                    className="font-semibold text-primary-700 hover:text-primary-800"
                                >
                                    Students page
                                </Link>{" "}
                                first. Once they sign up they can be added here.
                            </p>
                        ) : (
                            <Button
                                variant="primary"
                                onClick={() => setShowPicker(true)}
                                disabled={classMeta.isArchived}
                            >
                                <UserPlus
                                    className="mr-1.5 h-4 w-4"
                                    strokeWidth={2}
                                    aria-hidden
                                />
                                Add students
                            </Button>
                        )}
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[640px] text-sm">
                            <thead>
                                <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                    <th className="px-5 py-2.5">Student</th>
                                    <th className="px-5 py-2.5">Roll #</th>
                                    <th className="px-5 py-2.5">Joined</th>
                                    <th className="px-5 py-2.5"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {visibleRoster.map((s) => (
                                    <tr
                                        key={s.id}
                                        className="border-b border-slate-100 hover:bg-slate-50/40"
                                    >
                                        <td className="px-5 py-3">
                                            <p className="text-sm font-medium text-slate-900">
                                                {s.studentName}
                                            </p>
                                            <p className="text-xs text-slate-500">
                                                {s.studentEmail}
                                            </p>
                                        </td>
                                        <td className="px-5 py-3 text-xs text-slate-600">
                                            {s.rollNumber ?? "—"}
                                        </td>
                                        <td className="px-5 py-3 text-xs text-slate-500">
                                            {formatDate(s.enrolledAt)}
                                        </td>
                                        <td className="px-5 py-3 text-right">
                                            {!classMeta.isArchived && (
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        removeStudent(s.studentId, s.studentName)
                                                    }
                                                    className="inline-flex items-center gap-1 text-xs text-rose-600 hover:text-rose-700"
                                                >
                                                    <UserMinus
                                                        className="h-3 w-3"
                                                        strokeWidth={2}
                                                        aria-hidden
                                                    />
                                                    Remove
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            {showPicker && (
                <AddStudentsModal
                    students={eligibleInstituteStudents}
                    onAdd={addStudent}
                    onClose={() => setShowPicker(false)}
                />
            )}
        </div>
    );
}

function AddStudentsModal({
    students,
    onAdd,
    onClose,
}: {
    students: InstituteStudent[];
    onAdd: (inviteId: string) => Promise<void>;
    onClose: () => void;
}) {
    const [query, setQuery] = useState("");
    const [busyId, setBusyId] = useState<string | null>(null);

    const filtered = useMemo(() => {
        const needle = query.trim().toLowerCase();
        if (!needle) return students;
        return students.filter(
            (s) =>
                s.email.toLowerCase().includes(needle) ||
                (s.name || "").toLowerCase().includes(needle)
        );
    }, [students, query]);

    const handleAdd = async (id: string) => {
        setBusyId(id);
        try {
            await onAdd(id);
        } finally {
            setBusyId(null);
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
            onClick={onClose}
        >
            <Card
                className="mx-4 flex w-full max-w-lg flex-col p-0"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="border-b border-slate-100 p-5">
                    <h3 className="text-lg font-semibold text-slate-900">
                        Add students to this class
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                        Pulled from your institute&apos;s attached students who
                        aren&apos;t in this class yet.
                    </p>
                    <div className="relative mt-3">
                        <Search
                            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                            strokeWidth={2}
                            aria-hidden
                        />
                        <input
                            type="search"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search by name or email"
                            className="w-full rounded-lg border border-slate-300 pl-8 pr-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                            autoFocus
                        />
                    </div>
                </div>
                <div className="max-h-[60vh] overflow-y-auto">
                    {filtered.length === 0 ? (
                        <div className="space-y-1 px-5 py-10 text-center text-sm text-slate-500">
                            {students.length === 0 ? (
                                <>
                                    <p>Every attached student is already in this class.</p>
                                    <p className="text-xs">
                                        Pre-register more students on the{" "}
                                        <Link
                                            href="/institute/students"
                                            className="font-semibold text-primary-700 hover:text-primary-800"
                                        >
                                            Students page
                                        </Link>{" "}
                                        to grow the pool.
                                    </p>
                                </>
                            ) : (
                                <p>No match for &quot;{query}&quot;.</p>
                            )}
                        </div>
                    ) : (
                        <ul className="divide-y divide-slate-100">
                            {filtered.map((s) => (
                                <li
                                    key={s.id}
                                    className="flex items-center justify-between gap-3 px-5 py-3"
                                >
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium text-slate-900">
                                            {s.name || s.email}
                                        </p>
                                        <p className="truncate text-xs text-slate-500">
                                            {s.email}
                                        </p>
                                    </div>
                                    <Button
                                        variant="outline"
                                        onClick={() => handleAdd(s.id)}
                                        isLoading={busyId === s.id}
                                        disabled={busyId !== null}
                                        className="!py-1 !text-xs"
                                    >
                                        Add
                                    </Button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
                <div className="border-t border-slate-100 p-4 text-right">
                    <Button variant="outline" onClick={onClose}>
                        Done
                    </Button>
                </div>
            </Card>
        </div>
    );
}

function formatDate(iso: string | null): string {
    if (!iso) return "—";
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) return "—";
    const d = new Date(ms);
    return d.toLocaleDateString(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric",
    });
}
