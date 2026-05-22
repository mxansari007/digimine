"use client";

import { useCallback, useEffect, useState, type ChangeEvent, useRef } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Button, Card } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { teacherFetch } from "@/lib/api/teacherFetch";

type ClassShape = {
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

type StudentRow = {
    id: string;
    studentId: string;
    studentEmail: string;
    studentName: string;
    rollNumber: string | null;
    enrolledAt: string | null;
    status: "active" | "banned" | "removed";
    totalAttempts: number;
    lastActiveAt: string | null;
};

function formatDate(value?: string | null) {
    if (!value) return "-";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("en-IN");
}

export default function TeacherClassDetailPage() {
    const params = useParams();
    const router = useRouter();
    const classId = params.classId as string;
    const { firebaseUser } = useAuthContext();

    const [classroom, setClassroom] = useState<ClassShape | null>(null);
    const [students, setStudents] = useState<StudentRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [showSettings, setShowSettings] = useState(false);
    const [emailInput, setEmailInput] = useState("");
    const [adding, setAdding] = useState(false);
    const [savingName, setSavingName] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    const load = useCallback(async () => {
        if (!firebaseUser) return;
        setLoading(true);
        setError("");
        try {
            const [classRes, studentsRes] = await Promise.all([
                teacherFetch(firebaseUser, `/api/teacher/classes/${encodeURIComponent(classId)}`),
                teacherFetch(firebaseUser, `/api/teacher/classes/${encodeURIComponent(classId)}/students`),
            ]);
            const classData = await classRes.json();
            const studentsData = await studentsRes.json();
            if (!classRes.ok) throw new Error(classData.error || "Failed to load class.");
            if (!studentsRes.ok) throw new Error(studentsData.error || "Failed to load students.");
            setClassroom(classData.class || null);
            setStudents(studentsData.students || []);
        } catch (err: any) {
            setError(err.message || "Failed to load class.");
        } finally {
            setLoading(false);
        }
    }, [classId, firebaseUser]);

    useEffect(() => {
        load();
    }, [load]);

    const copyInviteCode = () => {
        if (!classroom) return;
        navigator.clipboard.writeText(classroom.inviteCode);
    };

    const copyInviteLink = () => {
        if (!classroom) return;
        const url = `${window.location.origin}/join/${classroom.inviteCode}`;
        navigator.clipboard.writeText(url);
    };

    const regenerateInvite = async () => {
        if (!firebaseUser || !classroom) return;
        if (!confirm("Regenerate the invite code? The current link will stop working.")) return;
        try {
            const res = await teacherFetch(firebaseUser, `/api/teacher/classes/${encodeURIComponent(classId)}`, {
                method: "PATCH",
                body: JSON.stringify({ regenerateInviteCode: true }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to regenerate invite code.");
            setClassroom(data.class);
        } catch (err: any) {
            alert(err.message || "Failed to regenerate invite code.");
        }
    };

    const renameClass = async (name: string, description: string | null) => {
        if (!firebaseUser) return;
        setSavingName(true);
        try {
            const res = await teacherFetch(firebaseUser, `/api/teacher/classes/${encodeURIComponent(classId)}`, {
                method: "PATCH",
                body: JSON.stringify({ name, description }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to update class.");
            setClassroom(data.class);
            setShowSettings(false);
        } catch (err: any) {
            alert(err.message || "Failed to update class.");
        } finally {
            setSavingName(false);
        }
    };

    const archiveClass = async () => {
        if (!firebaseUser || !classroom) return;
        if (!confirm("Archive this class? Students will lose access to its content.")) return;
        try {
            const res = await teacherFetch(firebaseUser, `/api/teacher/classes/${encodeURIComponent(classId)}`, {
                method: "DELETE",
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Failed to archive class.");
            }
            router.push("/teacher/classes");
        } catch (err: any) {
            alert(err.message || "Failed to archive class.");
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
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to add student.");
            setEmailInput("");
            await load();
        } catch (err: any) {
            alert(err.message || "Failed to add student.");
        } finally {
            setAdding(false);
        }
    };

    const handleStatus = async (studentId: string, status: "active" | "banned" | "removed") => {
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
                const data = await res.json();
                throw new Error(data.error || "Failed to update student.");
            }
            await load();
        } catch (err: any) {
            alert(err.message || "Failed to update student.");
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
                await teacherFetch(firebaseUser, `/api/teacher/classes/${encodeURIComponent(classId)}/students`, {
                    method: "POST",
                    body: JSON.stringify({ studentEmail: email, studentName: name }),
                }).catch(() => null);
            }
            event.target.value = "";
            await load();
        };
        reader.readAsText(file);
    };

    if (loading) return <div className="py-20 text-center text-gray-500">Loading...</div>;
    if (error || !classroom) {
        return (
            <Card className="p-8 text-center text-red-700">
                {error || "Class not found."}{" "}
                <Link href="/teacher/classes" className="text-primary-700 underline ml-2">
                    Back to classes
                </Link>
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <Link href="/teacher/classes" className="text-sm text-primary-700 hover:text-primary-800">
                        ← Back to classes
                    </Link>
                    <h1 className="mt-1 text-2xl font-bold text-gray-900">{classroom.name}</h1>
                    {classroom.description && (
                        <p className="text-sm text-gray-500 mt-1 max-w-2xl">{classroom.description}</p>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {classroom.isArchived && (
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                            Archived
                        </span>
                    )}
                    <Link href={`/teacher/classes/${classroom.id}/analytics`}>
                        <Button variant="primary">Analytics</Button>
                    </Link>
                    <Button variant="outline" onClick={() => setShowSettings(true)}>
                        Settings
                    </Button>
                    {!classroom.isArchived && (
                        <Button variant="outline" onClick={archiveClass} className="text-red-600 hover:bg-red-50 border-red-200">
                            Archive
                        </Button>
                    )}
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <Card className="p-5">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Active students</p>
                    <p className="mt-2 text-3xl font-bold text-gray-900">{classroom.activeStudentsCount}</p>
                    <p className="mt-1 text-xs text-gray-500">{classroom.studentsCount} total in roster</p>
                </Card>
                <Card className="p-5 md:col-span-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Invite code</p>
                    <p className="mt-2 font-mono text-2xl font-bold text-primary-700">{classroom.inviteCode}</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        <button onClick={copyInviteCode} className="text-primary-700 hover:text-primary-800">
                            Copy code
                        </button>
                        <button onClick={copyInviteLink} className="text-primary-700 hover:text-primary-800">
                            Copy invite link
                        </button>
                        <button onClick={regenerateInvite} className="text-amber-700 hover:text-amber-800">
                            Regenerate
                        </button>
                    </div>
                </Card>
            </div>

            <Card className="p-6">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Add a student</h3>
                <div className="flex gap-2">
                    <input
                        type="email"
                        value={emailInput}
                        onChange={(e) => setEmailInput(e.target.value)}
                        placeholder="student@example.com"
                        className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm"
                    />
                    <Button variant="primary" disabled={adding || !emailInput.trim()} onClick={addStudent}>
                        {adding ? "Adding..." : "Add"}
                    </Button>
                </div>
                <div className="mt-3 flex gap-3">
                    <Button variant="outline" onClick={() => fileRef.current?.click()}>
                        Upload CSV
                    </Button>
                    <input ref={fileRef} type="file" accept=".csv" onChange={handleCsv} className="hidden" />
                </div>
            </Card>

            <Card className="p-0 overflow-hidden">
                <div className="border-b border-gray-100 px-5 py-3">
                    <h3 className="text-sm font-semibold text-gray-900">Roster ({students.length})</h3>
                </div>
                {students.length === 0 ? (
                    <div className="py-12 text-center text-sm text-gray-500">
                        No students yet. Share the invite code or add by email.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[800px] text-sm">
                            <thead>
                                <tr className="border-b border-gray-100 bg-gray-50">
                                    <th className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500">Name</th>
                                    <th className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500">Email</th>
                                    <th className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500">Status</th>
                                    <th className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500">Enrolled</th>
                                    <th className="px-5 py-3"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {students.map((s) => (
                                    <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50">
                                        <td className="px-5 py-3 font-medium text-gray-900">
                                            {s.studentId.startsWith("pending:") ? (
                                                <span>{s.studentName}</span>
                                            ) : (
                                                <Link
                                                    href={`/teacher/students/${encodeURIComponent(s.studentId)}`}
                                                    className="hover:text-primary-700"
                                                >
                                                    {s.studentName}
                                                </Link>
                                            )}
                                        </td>
                                        <td className="px-5 py-3 text-gray-600">{s.studentEmail}</td>
                                        <td className="px-5 py-3">
                                            <span
                                                className={`rounded-full px-2 py-0.5 text-xs ${
                                                    s.status === "active"
                                                        ? "bg-green-50 text-green-700"
                                                        : s.status === "banned"
                                                        ? "bg-red-50 text-red-700"
                                                        : "bg-gray-100 text-gray-600"
                                                }`}
                                            >
                                                {s.status}
                                            </span>
                                            {s.studentId.startsWith("pending:") && (
                                                <span className="ml-2 text-[10px] uppercase text-amber-600">
                                                    pending
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-5 py-3 text-gray-500">{formatDate(s.enrolledAt)}</td>
                                        <td className="px-5 py-3 text-right">
                                            <div className="inline-flex gap-2">
                                                {s.status === "active" ? (
                                                    <button
                                                        onClick={() => handleStatus(s.studentId, "banned")}
                                                        className="text-xs text-amber-600 hover:text-amber-700"
                                                    >
                                                        Ban
                                                    </button>
                                                ) : s.status === "banned" ? (
                                                    <button
                                                        onClick={() => handleStatus(s.studentId, "active")}
                                                        className="text-xs text-emerald-600 hover:text-emerald-700"
                                                    >
                                                        Reinstate
                                                    </button>
                                                ) : null}
                                                {s.status !== "removed" && (
                                                    <button
                                                        onClick={() => handleStatus(s.studentId, "removed")}
                                                        className="text-xs text-red-600 hover:text-red-700"
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

function ClassSettingsModal({
    classroom,
    saving,
    onClose,
    onSave,
}: {
    classroom: ClassShape;
    saving: boolean;
    onClose: () => void;
    onSave: (name: string, description: string | null) => void;
}) {
    const [name, setName] = useState(classroom.name);
    const [description, setDescription] = useState(classroom.description || "");

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
            <Card className="w-full max-w-md mx-4 p-6" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">Class settings</h3>
                <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={80}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm mb-3 focus:ring-2 focus:ring-indigo-500"
                />
                <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    placeholder="Description (optional)"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm mb-4 focus:ring-2 focus:ring-indigo-500"
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
