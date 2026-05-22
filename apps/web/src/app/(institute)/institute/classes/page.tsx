"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { teacherFetch } from "@/lib/api/teacherFetch";

type ClassRow = {
    id: string;
    name: string;
    description: string | null;
    teacherId: string;
    inviteCode: string;
    studentsCount: number;
    activeStudentsCount: number;
    isArchived: boolean;
    createdAt: string | null;
};

type TeacherOption = { teacherId: string; email: string; name: string | null };

export default function InstituteClassesPage() {
    const { firebaseUser } = useAuthContext();
    const [instituteId, setInstituteId] = useState("");
    const [classes, setClasses] = useState<ClassRow[]>([]);
    const [teachers, setTeachers] = useState<TeacherOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const [showCreate, setShowCreate] = useState(false);
    const [newName, setNewName] = useState("");
    const [newDescription, setNewDescription] = useState("");
    const [newTeacherId, setNewTeacherId] = useState("");
    const [creating, setCreating] = useState(false);

    const teacherMap = useMemo(() => {
        const map = new Map<string, string>();
        teachers.forEach((t) => map.set(t.teacherId, t.name || t.email));
        return map;
    }, [teachers]);

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
            if (!teachersRes.ok) throw new Error(teachersData.error || "Failed to load teachers");

            setClasses(classesData.classes || []);
            setTeachers(
                (teachersData.teachers || []).filter((t: any) => t.status === "active")
            );
        } catch (err: any) {
            setError(err.message || "Failed");
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
                        teacherId: newTeacherId || undefined,
                    }),
                }
            );
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed");
            setShowCreate(false);
            setNewName("");
            setNewDescription("");
            setNewTeacherId("");
            await loadAll();
        } catch (err: any) {
            alert(err.message);
        } finally {
            setCreating(false);
        }
    };

    const handleReassign = async (cls: ClassRow, teacherId: string) => {
        if (!firebaseUser) return;
        try {
            const res = await teacherFetch(
                firebaseUser,
                `/api/institute/${encodeURIComponent(instituteId)}/classes/${encodeURIComponent(cls.id)}`,
                { method: "PATCH", body: JSON.stringify({ teacherId }) }
            );
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Failed");
            }
            await loadAll();
        } catch (err: any) {
            alert(err.message);
        }
    };

    const handleArchive = async (cls: ClassRow) => {
        if (!firebaseUser) return;
        if (!confirm(`Archive "${cls.name}"? Students will lose access to its content.`)) return;
        try {
            const res = await teacherFetch(
                firebaseUser,
                `/api/institute/${encodeURIComponent(instituteId)}/classes/${encodeURIComponent(cls.id)}`,
                { method: "DELETE" }
            );
            if (!res.ok) throw new Error("Failed");
            await loadAll();
        } catch (err: any) {
            alert(err.message);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Classes</h1>
                    <p className="mt-1 text-gray-500">
                        Create batches, assign teachers, and share invite codes with students.
                    </p>
                </div>
                <Button variant="primary" onClick={() => setShowCreate(true)}>
                    + New class
                </Button>
            </div>

            {error && <Card className="p-4 text-sm text-rose-700 border-rose-200 bg-rose-50">{error}</Card>}

            {loading ? (
                <Card className="p-12 text-center text-sm text-gray-500">Loading...</Card>
            ) : classes.length === 0 ? (
                <Card className="p-12 text-center text-gray-500">
                    No classes yet. Create one and assign a teacher to get started.
                </Card>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {classes.map((cls) => (
                        <Card key={cls.id} className="p-6 flex flex-col">
                            <div className="flex items-start justify-between">
                                <div className="min-w-0">
                                    <h3 className="font-semibold text-gray-900 truncate">{cls.name}</h3>
                                    {cls.description && (
                                        <p className="text-xs text-gray-500 mt-1 line-clamp-2">{cls.description}</p>
                                    )}
                                </div>
                                {cls.isArchived && <span className="chip-neutral">Archived</span>}
                            </div>
                            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                                <div>
                                    <p className="stat-label">Active students</p>
                                    <p className="text-2xl font-bold text-gray-900">{cls.activeStudentsCount}</p>
                                </div>
                                <div>
                                    <p className="stat-label">Total roster</p>
                                    <p className="text-2xl font-bold text-gray-900">{cls.studentsCount}</p>
                                </div>
                            </div>
                            <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                                <p className="stat-label">Invite code</p>
                                <p className="font-mono text-sm font-semibold text-primary-700">{cls.inviteCode}</p>
                            </div>
                            <div className="mt-4">
                                <label className="stat-label">Assigned teacher</label>
                                <select
                                    value={cls.teacherId}
                                    onChange={(e) => handleReassign(cls, e.target.value)}
                                    className="field-input mt-1.5 py-1.5 text-xs"
                                >
                                    <option value="">— unassigned —</option>
                                    {teachers.map((t) => (
                                        <option key={t.teacherId} value={t.teacherId}>
                                            {t.name || t.email}
                                        </option>
                                    ))}
                                </select>
                                {cls.teacherId && (
                                    <p className="mt-1 text-[10px] text-gray-500">
                                        Currently: {teacherMap.get(cls.teacherId) || cls.teacherId}
                                    </p>
                                )}
                            </div>
                            {!cls.isArchived && (
                                <div className="mt-4 flex justify-end">
                                    <button
                                        onClick={() => handleArchive(cls)}
                                        className="text-xs text-red-600 hover:text-red-700"
                                    >
                                        Archive
                                    </button>
                                </div>
                            )}
                        </Card>
                    ))}
                </div>
            )}

            {showCreate && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
                    onClick={() => !creating && setShowCreate(false)}
                >
                    <Card className="w-full max-w-md mx-4 p-6" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-lg font-semibold text-gray-900 mb-1">Create class</h3>
                        <p className="text-gray-500 text-sm mb-4">
                            Give it a name students will recognise (e.g. &quot;Class 10A — Maths&quot;).
                        </p>
                        <input
                            type="text"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            placeholder="Class name"
                            maxLength={80}
                            className="field-input mb-3"
                        />
                        <textarea
                            value={newDescription}
                            onChange={(e) => setNewDescription(e.target.value)}
                            rows={3}
                            placeholder="Description (optional)"
                            className="field-input mb-3"
                        />
                        <label className="stat-label">Assign teacher (optional)</label>
                        <select
                            value={newTeacherId}
                            onChange={(e) => setNewTeacherId(e.target.value)}
                            className="field-input mt-1.5 mb-4 py-2 text-sm"
                        >
                            <option value="">— pick later —</option>
                            {teachers.map((t) => (
                                <option key={t.teacherId} value={t.teacherId}>
                                    {t.name || t.email}
                                </option>
                            ))}
                        </select>
                        <div className="flex gap-2">
                            <Button
                                variant="primary"
                                className="flex-1"
                                onClick={handleCreate}
                                isLoading={creating}
                                disabled={!newName.trim()}
                            >
                                Create
                            </Button>
                            <Button variant="outline" onClick={() => setShowCreate(false)} disabled={creating}>
                                Cancel
                            </Button>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
}
