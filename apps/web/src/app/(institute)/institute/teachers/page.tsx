"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { teacherFetch } from "@/lib/api/teacherFetch";

type TeacherRow = {
    id: string;
    teacherId: string;
    email: string;
    name: string | null;
    status: "invited" | "active" | "removed";
    invitedAt: string | null;
    joinedAt: string | null;
};

function statusChip(status: string) {
    if (status === "active") return "chip-success";
    if (status === "invited") return "chip-warning";
    return "chip-neutral";
}

function formatDate(value?: string | null) {
    if (!value) return "-";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("en-IN");
}

export default function InstituteTeachersPage() {
    const { firebaseUser } = useAuthContext();
    const [instituteId, setInstituteId] = useState("");
    const [teachers, setTeachers] = useState<TeacherRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [email, setEmail] = useState("");
    const [name, setName] = useState("");
    const [inviting, setInviting] = useState(false);

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
            const res = await teacherFetch(
                firebaseUser,
                `/api/institute/${encodeURIComponent(id)}/teachers`
            );
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to load");
            setTeachers(data.teachers || []);
        } catch (err: any) {
            setError(err.message || "Failed to load teachers");
        } finally {
            setLoading(false);
        }
    }, [firebaseUser]);

    useEffect(() => {
        loadAll();
    }, [loadAll]);

    const handleInvite = async () => {
        if (!firebaseUser || !instituteId || !email.trim()) return;
        setInviting(true);
        try {
            const res = await teacherFetch(
                firebaseUser,
                `/api/institute/${encodeURIComponent(instituteId)}/teachers`,
                {
                    method: "POST",
                    body: JSON.stringify({ email: email.trim(), name: name.trim() }),
                }
            );
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed");
            setEmail("");
            setName("");
            await loadAll();
        } catch (err: any) {
            alert(err.message);
        } finally {
            setInviting(false);
        }
    };

    const handleStatusChange = async (row: TeacherRow, status: TeacherRow["status"]) => {
        if (!firebaseUser) return;
        if (status === "removed" && !confirm(`Remove ${row.email} from this institute?`)) return;
        try {
            const res = await teacherFetch(
                firebaseUser,
                `/api/institute/${encodeURIComponent(instituteId)}/teachers/${encodeURIComponent(row.id)}`,
                { method: "PATCH", body: JSON.stringify({ status }) }
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

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Teachers</h1>
                <p className="mt-1 text-gray-500">
                    Invite teachers, manage status, and see who&apos;s actively teaching under your institute.
                </p>
            </div>

            <Card className="p-6">
                <h3 className="text-sm font-semibold text-gray-900">Invite a teacher</h3>
                <p className="text-xs text-gray-500 mt-1">
                    Existing teachers join instantly. New emails get a pending row — they accept it once they sign up
                    and join via the invite code.
                </p>
                <div className="mt-4 grid gap-3 md:grid-cols-[1.4fr_1fr_auto]">
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="teacher@example.com"
                        className="field-input"
                    />
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Name (optional)"
                        className="field-input"
                    />
                    <Button
                        variant="primary"
                        onClick={handleInvite}
                        isLoading={inviting}
                        disabled={!email.trim()}
                    >
                        Invite
                    </Button>
                </div>
            </Card>

            {error && <Card className="p-4 text-sm text-rose-700 border-rose-200 bg-rose-50">{error}</Card>}

            {loading ? (
                <Card className="p-12 text-center text-sm text-gray-500">Loading...</Card>
            ) : teachers.length === 0 ? (
                <Card className="p-12 text-center text-gray-500">
                    No teachers yet. Invite your first one above.
                </Card>
            ) : (
                <Card className="p-0 overflow-hidden">
                    <table className="w-full min-w-[800px] text-sm">
                        <thead>
                            <tr className="border-b border-gray-100 bg-gray-50 text-xs uppercase text-gray-500">
                                <th className="px-5 py-3 text-left">Teacher</th>
                                <th className="px-5 py-3 text-left">Status</th>
                                <th className="px-5 py-3 text-left">Invited</th>
                                <th className="px-5 py-3 text-left">Joined</th>
                                <th className="px-5 py-3"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {teachers.map((t) => (
                                <tr key={t.id} className="border-b border-gray-100 hover:bg-gray-50">
                                    <td className="px-5 py-3">
                                        <p className="font-medium text-gray-900">{t.name || t.email}</p>
                                        <p className="text-xs text-gray-500">{t.email}</p>
                                    </td>
                                    <td className="px-5 py-3">
                                        <span className={statusChip(t.status)}>{t.status}</span>
                                    </td>
                                    <td className="px-5 py-3 text-gray-600">{formatDate(t.invitedAt)}</td>
                                    <td className="px-5 py-3 text-gray-600">{formatDate(t.joinedAt)}</td>
                                    <td className="px-5 py-3 text-right">
                                        <div className="inline-flex gap-2 text-xs">
                                            {t.status === "active" && (
                                                <button
                                                    onClick={() => handleStatusChange(t, "removed")}
                                                    className="text-red-600 hover:text-red-700"
                                                >
                                                    Remove
                                                </button>
                                            )}
                                            {t.status === "invited" && (
                                                <button
                                                    onClick={() => handleStatusChange(t, "removed")}
                                                    className="text-gray-600 hover:text-gray-900"
                                                >
                                                    Cancel
                                                </button>
                                            )}
                                            {t.status === "removed" && (
                                                <button
                                                    onClick={() => handleStatusChange(t, "active")}
                                                    className="text-emerald-700 hover:text-emerald-900"
                                                >
                                                    Reinstate
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </Card>
            )}
        </div>
    );
}
