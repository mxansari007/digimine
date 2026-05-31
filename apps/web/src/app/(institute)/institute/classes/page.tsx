"use client";

/**
 * Institute admin → Classes page.
 *
 * A class (e.g. "610-A") is a section composed of multiple SUBJECTS, each
 * taught by a different teacher. The class still carries a `teacherId`
 * field for backward compat (treated as the "lead teacher"), but the
 * source of truth for "who teaches what" is the per-class `subjects`
 * subcollection.
 *
 * UI on each class card:
 *   - Name, description, archived chip
 *   - Active/total student counts
 *   - Invite code
 *   - SUBJECTS section: list of {name, teacher, remove}, with an
 *     "Add subject" inline form (name + teacher dropdown)
 *   - Archive button
 *
 * What changed vs the previous "Assigned teacher" select:
 *   - The single-teacher dropdown is gone — a class no longer "belongs to"
 *     one teacher exclusively. Instead, teachers are layered in by subject.
 *   - The class-create modal also drops the teacher field; you assign
 *     subjects + teachers AFTER the class exists.
 *
 * Backward compat:
 *   - Existing classes without subjects still work — the card just shows
 *     "No subjects yet. Add one to assign a teacher."
 *   - The first subject added to a class is also written to `class.teacherId`
 *     so existing teacher-portal queries that filter on `teacherId` keep
 *     returning the class.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button, Card } from "@digimine/ui";
import { BookOpen, Plus, Trash2, Users, Copy, Archive, ChevronRight } from "lucide-react";
import { useAuthContext } from "@/contexts/AuthContext";
import { teacherFetch } from "@/lib/api/teacherFetch";
import { HelpTutorial } from "@/components/help/HelpTutorial";
import { TUTORIALS } from "@/components/help/tutorials";

type ClassRow = {
    id: string;
    name: string;
    description: string | null;
    teacherId: string;
    inviteCode: string;
    studentsCount: number;
    activeStudentsCount: number;
    subjectCount?: number;
    teacherIds?: string[];
    isArchived: boolean;
    createdAt: string | null;
};

type TeacherOption = { teacherId: string; email: string; name: string | null };

type Subject = {
    id: string;
    name: string;
    teacherId: string;
    teacherName: string;
    teacherEmail: string;
    order: number;
};

export default function InstituteClassesPage() {
    const { firebaseUser } = useAuthContext();
    const [instituteId, setInstituteId] = useState("");
    const [classes, setClasses] = useState<ClassRow[]>([]);
    const [teachers, setTeachers] = useState<TeacherOption[]>([]);
    const [subjectsByClass, setSubjectsByClass] = useState<Record<string, Subject[]>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    // Create-class modal
    const [showCreate, setShowCreate] = useState(false);
    const [newName, setNewName] = useState("");
    const [newDescription, setNewDescription] = useState("");
    const [creating, setCreating] = useState(false);

    const loadAll = useCallback(async () => {
        if (!firebaseUser) return;
        setLoading(true);
        setError("");
        try {
            const meRes = await teacherFetch(firebaseUser, "/api/institute/me");
            const meData = await meRes.json();
            const id = meData?.institute?.id;
            if (!id) throw new Error("No institute");
            setInstituteId(id);

            const [classesRes, teachersRes] = await Promise.all([
                teacherFetch(firebaseUser, `/api/institute/${encodeURIComponent(id)}/classes`),
                teacherFetch(firebaseUser, `/api/institute/${encodeURIComponent(id)}/teachers`),
            ]);
            const classesData = await classesRes.json();
            const teachersData = await teachersRes.json();
            if (!classesRes.ok) throw new Error(classesData.error || "Failed to load classes");
            if (!teachersRes.ok)
                throw new Error(teachersData.error || "Failed to load teachers");

            const rows: ClassRow[] = classesData.classes || [];
            setClasses(rows);
            const activeTeachers = (teachersData.teachers || []).filter(
                (t: { status?: string }) => t.status === "active"
            );
            setTeachers(activeTeachers);

            // Fan-out: load subjects for each class in parallel. For 20–50
            // classes this is fine; if institutes grow much bigger we can
            // either lazy-load on expand or denormalise the subjects array
            // onto the class doc.
            const subjectMap: Record<string, Subject[]> = {};
            await Promise.all(
                rows.map(async (cls) => {
                    const res = await teacherFetch(
                        firebaseUser,
                        `/api/institute/${encodeURIComponent(id)}/classes/${encodeURIComponent(cls.id)}/subjects`
                    );
                    const data = await res.json();
                    if (res.ok) subjectMap[cls.id] = data.subjects || [];
                })
            );
            setSubjectsByClass(subjectMap);
        } catch (err) {
            setError((err as Error)?.message || "Failed");
        } finally {
            setLoading(false);
        }
    }, [firebaseUser]);

    useEffect(() => {
        loadAll();
    }, [loadAll]);

    const handleCreate = async () => {
        if (!firebaseUser || !instituteId || !newName.trim()) return;
        setCreating(true);
        try {
            const res = await teacherFetch(
                firebaseUser,
                `/api/institute/${encodeURIComponent(instituteId)}/classes`,
                {
                    method: "POST",
                    body: JSON.stringify({
                        name: newName.trim(),
                        description: newDescription.trim(),
                    }),
                }
            );
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed");
            setShowCreate(false);
            setNewName("");
            setNewDescription("");
            await loadAll();
        } catch (err) {
            alert((err as Error)?.message);
        } finally {
            setCreating(false);
        }
    };

    const handleArchive = async (cls: ClassRow) => {
        if (!firebaseUser) return;
        if (!confirm(`Archive "${cls.name}"? Students will lose access to its content.`))
            return;
        try {
            const res = await teacherFetch(
                firebaseUser,
                `/api/institute/${encodeURIComponent(instituteId)}/classes/${encodeURIComponent(cls.id)}`,
                { method: "DELETE" }
            );
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                if (res.status === 409 && body?.activeStudents) {
                    const force = confirm(
                        `${body.error}\n\nArchive anyway? Students will lose access immediately.`
                    );
                    if (!force) return;
                    const forced = await teacherFetch(
                        firebaseUser,
                        `/api/institute/${encodeURIComponent(instituteId)}/classes/${encodeURIComponent(cls.id)}?force=true`,
                        { method: "DELETE" }
                    );
                    if (!forced.ok) {
                        const fbody = await forced.json().catch(() => ({}));
                        throw new Error(fbody?.error || "Failed to archive");
                    }
                } else {
                    throw new Error(body?.error || "Failed to archive");
                }
            }
            await loadAll();
        } catch (err) {
            alert((err as Error)?.message);
        }
    };

    const handleAddSubject = async (cls: ClassRow, name: string, teacherId: string) => {
        if (!firebaseUser || !name.trim() || !teacherId) return;
        const res = await teacherFetch(
            firebaseUser,
            `/api/institute/${encodeURIComponent(instituteId)}/classes/${encodeURIComponent(cls.id)}/subjects`,
            {
                method: "POST",
                body: JSON.stringify({ name: name.trim(), teacherId }),
            }
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed");
        await loadAll();
    };

    const handleChangeSubjectTeacher = async (
        cls: ClassRow,
        subject: Subject,
        teacherId: string
    ) => {
        if (!firebaseUser || !teacherId || teacherId === subject.teacherId) return;
        try {
            const res = await teacherFetch(
                firebaseUser,
                `/api/institute/${encodeURIComponent(instituteId)}/classes/${encodeURIComponent(cls.id)}/subjects/${encodeURIComponent(subject.id)}`,
                {
                    method: "PATCH",
                    body: JSON.stringify({ teacherId }),
                }
            );
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed");
            await loadAll();
        } catch (err) {
            alert((err as Error)?.message);
        }
    };

    const handleDeleteSubject = async (cls: ClassRow, subject: Subject) => {
        if (!firebaseUser) return;
        if (!confirm(`Remove "${subject.name}" from ${cls.name}?`)) return;
        try {
            const res = await teacherFetch(
                firebaseUser,
                `/api/institute/${encodeURIComponent(instituteId)}/classes/${encodeURIComponent(cls.id)}/subjects/${encodeURIComponent(subject.id)}`,
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

    const copyInvite = (code: string) => {
        const url = `${window.location.origin}/join/${code}`;
        navigator.clipboard.writeText(url);
    };

    if (loading) {
        return (
            <div className="space-y-4">
                <div className="h-8 w-48 animate-pulse rounded bg-slate-200" />
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="h-72 animate-pulse rounded-xl bg-slate-100" />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <div className="flex items-center gap-1.5">
                        <h1 className="text-2xl font-bold text-slate-900">Classes</h1>
                        <HelpTutorial {...TUTORIALS.institute_classes} />
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                        Each class is a section. Add the subjects taught in it, and
                        assign a different teacher per subject.
                    </p>
                </div>
                <Button
                    data-tour="new-class-button"
                    variant="primary"
                    onClick={() => setShowCreate(true)}
                >
                    <Plus className="mr-1.5 h-4 w-4" strokeWidth={2.5} aria-hidden />
                    New class
                </Button>
            </div>

            {error && (
                <Card className="border-rose-200 dark:border-rose-500/25 bg-rose-50 dark:bg-rose-500/10 p-4 text-sm text-rose-700 dark:text-rose-300">
                    {error}
                </Card>
            )}

            {classes.length === 0 ? (
                <Card className="p-12 text-center text-sm text-slate-500">
                    No classes yet. Create one to start adding subjects + teachers.
                </Card>
            ) : (
                <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                    {classes.map((cls) => (
                        <ClassCard
                            key={cls.id}
                            cls={cls}
                            subjects={subjectsByClass[cls.id] || []}
                            teachers={teachers}
                            onArchive={() => handleArchive(cls)}
                            onAddSubject={(name, teacherId) => handleAddSubject(cls, name, teacherId)}
                            onChangeSubjectTeacher={(subject, teacherId) =>
                                handleChangeSubjectTeacher(cls, subject, teacherId)
                            }
                            onDeleteSubject={(subject) => handleDeleteSubject(cls, subject)}
                            onCopyInvite={() => copyInvite(cls.inviteCode)}
                        />
                    ))}
                </div>
            )}

            {showCreate && (
                <CreateClassModal
                    name={newName}
                    description={newDescription}
                    creating={creating}
                    onName={setNewName}
                    onDescription={setNewDescription}
                    onClose={() => !creating && setShowCreate(false)}
                    onSubmit={handleCreate}
                />
            )}
        </div>
    );
}

// ─── Class card ───────────────────────────────────────────────────────

function ClassCard({
    cls,
    subjects,
    teachers,
    onArchive,
    onAddSubject,
    onChangeSubjectTeacher,
    onDeleteSubject,
    onCopyInvite,
}: {
    cls: ClassRow;
    subjects: Subject[];
    teachers: TeacherOption[];
    onArchive: () => void;
    onAddSubject: (name: string, teacherId: string) => Promise<void>;
    onChangeSubjectTeacher: (subject: Subject, teacherId: string) => void;
    onDeleteSubject: (subject: Subject) => void;
    onCopyInvite: () => void;
}) {
    const [newSubjectName, setNewSubjectName] = useState("");
    const [newSubjectTeacher, setNewSubjectTeacher] = useState("");
    const [adding, setAdding] = useState(false);
    const [addError, setAddError] = useState("");
    const [copied, setCopied] = useState(false);

    const teacherDisabled = teachers.length === 0;

    const handleAdd = async () => {
        setAddError("");
        if (!newSubjectName.trim() || !newSubjectTeacher) return;
        setAdding(true);
        try {
            await onAddSubject(newSubjectName, newSubjectTeacher);
            setNewSubjectName("");
            setNewSubjectTeacher("");
        } catch (err) {
            setAddError((err as Error)?.message || "Failed to add subject");
        } finally {
            setAdding(false);
        }
    };

    const handleCopy = () => {
        onCopyInvite();
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    return (
        <Card className="flex flex-col p-6">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <Link
                        href={`/institute/classes/${encodeURIComponent(cls.id)}`}
                        className="group inline-flex max-w-full items-center gap-1 truncate text-base font-semibold text-slate-900 hover:text-primary-700"
                    >
                        <span className="truncate">{cls.name}</span>
                        <ChevronRight
                            className="h-4 w-4 flex-shrink-0 text-slate-400 transition-colors group-hover:text-primary-700"
                            strokeWidth={2}
                            aria-hidden
                        />
                    </Link>
                    {cls.description && (
                        <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                            {cls.description}
                        </p>
                    )}
                </div>
                {cls.isArchived && (
                    <span className="flex-shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                        Archived
                    </span>
                )}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-lg bg-slate-50/80 p-2.5">
                    <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        <Users className="h-3 w-3" strokeWidth={2} aria-hidden />
                        Students
                    </p>
                    <p className="mt-1 text-lg font-bold text-slate-900">
                        {cls.activeStudentsCount}
                        <span className="ml-1 text-xs font-normal text-slate-400">
                            / {cls.studentsCount}
                        </span>
                    </p>
                </div>
                <div className="rounded-lg bg-slate-50/80 p-2.5">
                    <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        <BookOpen className="h-3 w-3" strokeWidth={2} aria-hidden />
                        Subjects
                    </p>
                    <p className="mt-1 text-lg font-bold text-slate-900">{subjects.length}</p>
                </div>
            </div>

            <div
                data-tour="invite-code"
                className="mt-3 flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2"
            >
                <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        Invite code
                    </p>
                    <p className="truncate font-mono text-sm font-semibold text-primary-700">
                        {cls.inviteCode}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={handleCopy}
                    className="ml-2 inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-50"
                    title="Copy invite link"
                >
                    <Copy className="h-3 w-3" strokeWidth={2} aria-hidden />
                    {copied ? "Copied" : "Copy"}
                </button>
            </div>

            {/* ─── Subjects manager ──────────────────────────────── */}
            <div
                data-tour="subjects-section"
                className="mt-5 border-t border-slate-100 pt-4"
            >
                <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Subjects &amp; teachers
                    </p>
                </div>

                {subjects.length === 0 ? (
                    <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
                        No subjects yet. Add one below to assign a teacher.
                    </p>
                ) : (
                    <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
                        {subjects.map((s) => (
                            <li
                                key={s.id}
                                className="flex items-center gap-2 px-3 py-2"
                            >
                                <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-300">
                                    <BookOpen className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium text-slate-900">
                                        {s.name}
                                    </p>
                                    <select
                                        value={s.teacherId}
                                        onChange={(e) => onChangeSubjectTeacher(s, e.target.value)}
                                        className="mt-0.5 w-full max-w-[180px] truncate bg-transparent text-[11px] text-slate-500 focus:outline-none"
                                        disabled={cls.isArchived}
                                    >
                                        {teachers.map((t) => (
                                            <option key={t.teacherId} value={t.teacherId}>
                                                {t.name || t.email}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                {!cls.isArchived && (
                                    <button
                                        type="button"
                                        onClick={() => onDeleteSubject(s)}
                                        className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-rose-50 dark:hover:bg-rose-500/10 hover:text-rose-600"
                                        title="Remove subject"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                                    </button>
                                )}
                            </li>
                        ))}
                    </ul>
                )}

                {!cls.isArchived && (
                    <div className="mt-2">
                        {teacherDisabled ? (
                            <p className="rounded-lg border border-amber-200 dark:border-amber-500/25 bg-amber-50 dark:bg-amber-500/10 p-2 text-[11px] text-amber-700 dark:text-amber-300">
                                Add at least one active teacher (Teachers → bulk add)
                                before assigning subjects.
                            </p>
                        ) : (
                            <div className="space-y-1.5">
                                <div className="flex gap-1.5">
                                    <input
                                        type="text"
                                        value={newSubjectName}
                                        onChange={(e) => setNewSubjectName(e.target.value)}
                                        placeholder="Subject (e.g. Mathematics)"
                                        maxLength={80}
                                        className="flex-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                                        disabled={adding}
                                    />
                                    <select
                                        value={newSubjectTeacher}
                                        onChange={(e) => setNewSubjectTeacher(e.target.value)}
                                        className="rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:border-primary-500 focus:outline-none"
                                        disabled={adding}
                                    >
                                        <option value="">Teacher…</option>
                                        {teachers.map((t) => (
                                            <option key={t.teacherId} value={t.teacherId}>
                                                {t.name || t.email}
                                            </option>
                                        ))}
                                    </select>
                                    <Button
                                        variant="primary"
                                        onClick={handleAdd}
                                        isLoading={adding}
                                        disabled={
                                            adding || !newSubjectName.trim() || !newSubjectTeacher
                                        }
                                        className="!py-1.5 !text-xs"
                                    >
                                        Add
                                    </Button>
                                </div>
                                {addError && (
                                    <p className="text-[11px] text-rose-600">{addError}</p>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {!cls.isArchived && (
                <div className="mt-4 flex justify-end border-t border-slate-100 pt-3">
                    <button
                        type="button"
                        onClick={onArchive}
                        className="inline-flex items-center gap-1 text-xs text-rose-600 hover:text-rose-700"
                    >
                        <Archive className="h-3 w-3" strokeWidth={2} aria-hidden />
                        Archive class
                    </button>
                </div>
            )}
        </Card>
    );
}

// ─── Create modal ─────────────────────────────────────────────────────

function CreateClassModal({
    name,
    description,
    creating,
    onName,
    onDescription,
    onClose,
    onSubmit,
}: {
    name: string;
    description: string;
    creating: boolean;
    onName: (v: string) => void;
    onDescription: (v: string) => void;
    onClose: () => void;
    onSubmit: () => void;
}) {
    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
            onClick={onClose}
        >
            <Card
                className="mx-4 w-full max-w-md p-6"
                onClick={(e) => e.stopPropagation()}
            >
                <h3 className="mb-1 text-lg font-semibold text-slate-900">Create class</h3>
                <p className="mb-4 text-sm text-slate-500">
                    Give it a section name students will recognise (e.g. &quot;610-A&quot; or
                    &quot;Frontend Cohort 2026&quot;). Add subjects + teachers after the
                    class is created.
                </p>
                <input
                    type="text"
                    value={name}
                    onChange={(e) => onName(e.target.value)}
                    placeholder="Class name"
                    maxLength={80}
                    className="mb-3 w-full rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
                <textarea
                    value={description}
                    onChange={(e) => onDescription(e.target.value)}
                    rows={3}
                    placeholder="Description (optional)"
                    className="mb-4 w-full rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
                <div className="flex gap-2">
                    <Button
                        variant="primary"
                        className="flex-1"
                        onClick={onSubmit}
                        isLoading={creating}
                        disabled={!name.trim()}
                    >
                        Create
                    </Button>
                    <Button variant="outline" onClick={onClose} disabled={creating}>
                        Cancel
                    </Button>
                </div>
            </Card>
        </div>
    );
}
