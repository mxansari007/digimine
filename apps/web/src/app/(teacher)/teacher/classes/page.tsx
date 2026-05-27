"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button, Card, useToast } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { teacherFetch } from "@/lib/api/teacherFetch";
import { getTeacher } from "@/lib/firestore/teachers";

type ClassRow = {
    id: string;
    teacherId: string;
    name: string;
    description: string | null;
    inviteCode: string;
    studentsCount: number;
    activeStudentsCount: number;
    isArchived: boolean;
    createdAt: string | null;
    updatedAt: string | null;
};

export default function TeacherClassesPage() {
    const { firebaseUser } = useAuthContext();
    const toast = useToast();
    const [classes, setClasses] = useState<ClassRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [showCreate, setShowCreate] = useState(false);
    const [newName, setNewName] = useState("");
    const [newDescription, setNewDescription] = useState("");
    const [creating, setCreating] = useState(false);
    const [includeArchived, setIncludeArchived] = useState(false);

    // Whether this teacher is affiliated with an institute. When true the
    // institute owns class creation — we hide the local "+ New Class" UI.
    const [instituteId, setInstituteId] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!firebaseUser) return;
        setLoading(true);
        setError("");
        try {
            const [res, teacherDoc] = await Promise.all([
                teacherFetch(firebaseUser, "/api/teacher/classes"),
                getTeacher(firebaseUser.uid).catch(() => null),
            ]);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to load classes.");
            setClasses(data.classes || []);
            const inst = (teacherDoc as any)?.instituteId;
            setInstituteId(typeof inst === "string" && inst ? inst : null);
        } catch (err: any) {
            setError(err.message || "Failed to load classes.");
        } finally {
            setLoading(false);
        }
    }, [firebaseUser]);

    useEffect(() => {
        load();
    }, [load]);

    const handleCreate = async () => {
        if (!firebaseUser || !newName.trim()) return;
        setCreating(true);
        try {
            const res = await teacherFetch(firebaseUser, "/api/teacher/classes", {
                method: "POST",
                body: JSON.stringify({ name: newName.trim(), description: newDescription.trim() }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to create class.");
            setShowCreate(false);
            setNewName("");
            setNewDescription("");
            await load();
        } catch (err: any) {
            toast.error(err.message || "Failed to create class.");
        } finally {
            setCreating(false);
        }
    };

    const visible = includeArchived ? classes : classes.filter((c) => !c.isArchived);

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Classes</h1>
                    <p className="mt-1 text-gray-500">
                        Each class has its own roster, invite code, and content selection.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 text-xs text-gray-500">
                        <input
                            type="checkbox"
                            checked={includeArchived}
                            onChange={(e) => setIncludeArchived(e.target.checked)}
                        />
                        Show archived
                    </label>
                    {!instituteId && (
                        <Button variant="primary" onClick={() => setShowCreate(true)}>
                            + New Class
                        </Button>
                    )}
                </div>
            </div>

            {instituteId && (
                <Card intent="info" className="p-4 text-sm">
                    <p className="font-semibold text-info-700">Your institute manages classes</p>
                    <p className="text-info-700/80 mt-0.5">
                        New classes are created and assigned by your institute admin. You can still manage students
                        and publish content to the classes assigned to you.
                    </p>
                </Card>
            )}

            {error && (
                <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</Card>
            )}

            {loading ? (
                <Card className="p-12 text-center text-gray-500">Loading...</Card>
            ) : visible.length === 0 ? (
                <Card className="p-12 text-center">
                    <p className="text-gray-500 mb-4">
                        {instituteId
                            ? "Your institute admin hasn't assigned any classes to you yet."
                            : "You don't have any classes yet. Create one to start inviting students."}
                    </p>
                    {!instituteId && (
                        <Button variant="primary" onClick={() => setShowCreate(true)}>
                            + Create Your First Class
                        </Button>
                    )}
                </Card>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {visible.map((c) => (
                        <Card key={c.id} className="p-6 flex flex-col">
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <h3 className="font-semibold text-gray-900 truncate">{c.name}</h3>
                                    {c.description && (
                                        <p className="text-xs text-gray-500 mt-1 line-clamp-2">{c.description}</p>
                                    )}
                                </div>
                                {c.isArchived && (
                                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                                        Archived
                                    </span>
                                )}
                            </div>
                            <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-gray-500">
                                <div>
                                    <div className="text-2xl font-bold text-gray-900">
                                        {c.activeStudentsCount}
                                    </div>
                                    <div>Active students</div>
                                </div>
                                <div>
                                    <div className="text-2xl font-bold text-gray-900">{c.studentsCount}</div>
                                    <div>Total roster</div>
                                </div>
                            </div>
                            <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                                <p className="text-[10px] uppercase tracking-wide text-gray-400">Invite code</p>
                                <p className="font-mono text-sm font-semibold text-primary-700">{c.inviteCode}</p>
                            </div>
                            <div className="mt-4 flex gap-2">
                                <Link href={`/teacher/classes/${c.id}`} className="flex-1">
                                    <Button variant="primary" className="w-full">Open</Button>
                                </Link>
                            </div>
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
                        <h3 className="text-lg font-semibold text-gray-900 mb-1">Create a new class</h3>
                        <p className="text-gray-500 text-sm mb-4">
                            Give your class a name students will recognise (e.g. &quot;Class 10A — Maths&quot;).
                        </p>
                        <input
                            type="text"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            placeholder="Class name"
                            maxLength={80}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm mb-3 focus:ring-2 focus:ring-indigo-500"
                        />
                        <textarea
                            value={newDescription}
                            onChange={(e) => setNewDescription(e.target.value)}
                            placeholder="Description (optional)"
                            rows={3}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm mb-4 focus:ring-2 focus:ring-indigo-500"
                        />
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
                            <Button
                                variant="outline"
                                onClick={() => setShowCreate(false)}
                                disabled={creating}
                            >
                                Cancel
                            </Button>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
}
