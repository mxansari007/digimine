"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { PageLoading } from "@/components/common";

type Meeting = { day: string; startTime: string; endTime: string; room: string | null };

type ClassRow = {
    classId: string;
    // Present when an institute class is expanded per-subject; used as the key.
    subjectId?: string | null;
    className: string;
    classDescription: string | null;
    inviteCode: string;
    isArchived: boolean;
    enrolledAt: string | null;
    teacherId: string;
    teacherName: string;
    teacherAvatar: string | null;
    teacherInstitute: string;
    // New model (null/empty on legacy classes).
    subject: string | null;
    sectionName: string | null;
    groupName: string | null;
    room: string | null;
    meetings: Meeting[];
};

const DAY_LABEL: Record<string, string> = {
    mon: "Mon",
    tue: "Tue",
    wed: "Wed",
    thu: "Thu",
    fri: "Fri",
    sat: "Sat",
    sun: "Sun",
};

function meetingSummary(meetings: Meeting[]): string {
    return meetings
        .slice(0, 3)
        .map((m) => `${DAY_LABEL[m.day] || m.day} ${m.startTime}`)
        .join(" · ");
}

export default function StudentClassroomsPage() {
    const router = useRouter();
    const { firebaseUser } = useAuthContext();
    const [classes, setClasses] = useState<ClassRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [showJoinModal, setShowJoinModal] = useState(false);
    const [inviteCode, setInviteCode] = useState("");
    const [joinError, setJoinError] = useState("");
    const [joining, setJoining] = useState(false);

    const loadClasses = useCallback(async () => {
        if (!firebaseUser) return;
        setLoading(true);
        try {
            const token = await firebaseUser.getIdToken();
            const res = await fetch(
                `/api/classroom/my-enrollments?studentId=${encodeURIComponent(firebaseUser.uid)}`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            const data = await res.json();
            setClasses(Array.isArray(data.classes) ? data.classes : []);
        } catch (err) {
            console.error("Failed to load classes:", err);
            setClasses([]);
        } finally {
            setLoading(false);
        }
    }, [firebaseUser]);

    useEffect(() => {
        loadClasses();
    }, [loadClasses]);

    const handleJoin = async () => {
        if (!firebaseUser || !inviteCode.trim()) return;
        setJoining(true);
        setJoinError("");
        try {
            const token = await firebaseUser.getIdToken();
            const res = await fetch("/api/classroom/enroll", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    inviteCode: inviteCode.trim(),
                    studentId: firebaseUser.uid,
                    studentEmail: firebaseUser.email,
                    studentName: firebaseUser.displayName,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to join");
            // Group joins return classIds[]; class joins return classId; legacy
            // returns teacherId.
            const firstGroupClass = Array.isArray(data.classIds) ? data.classIds[0] : null;
            const target = data.classId
                ? `/classroom/${data.classId}`
                : firstGroupClass
                ? `/classroom/${firstGroupClass}`
                : data.teacherId
                ? `/classroom/legacy:${data.teacherId}`
                : "/student/classrooms";
            // Group joins land you in one class but enroll you in several —
            // refresh the list either way.
            await loadClasses();
            router.push(target);
        } catch (err: any) {
            setJoinError(err.message || "Failed to join");
        }
        setJoining(false);
    };

    const handleLeave = async (row: ClassRow) => {
        if (!firebaseUser) return;
        const label = row.subject || row.className;
        if (!confirm(`Leave "${label}"?`)) return;
        try {
            const token = await firebaseUser.getIdToken();
            await fetch("/api/classroom/leave", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    classId: row.classId.startsWith("legacy:") ? null : row.classId,
                    teacherId: row.teacherId,
                    studentId: firebaseUser.uid,
                }),
            });
            await loadClasses();
        } catch (err) {
            console.error("Leave failed:", err);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">My Subjects</h1>
                    <p className="mt-1 text-gray-500">Subjects across the classes you&apos;ve joined.</p>
                </div>
                <div className="flex items-center gap-2">
                    <Link
                        href="/student/timetable"
                        className="text-sm font-medium text-indigo-600 hover:underline"
                    >
                        Timetable →
                    </Link>
                    <Button variant="primary" onClick={() => setShowJoinModal(true)}>+ Join</Button>
                </div>
            </div>

            {loading ? (
                <PageLoading variant="inline" />
            ) : classes.length === 0 ? (
                <Card className="p-12 text-center">
                    <p className="text-gray-500 mb-4">You haven&apos;t joined any classes yet.</p>
                    <Button variant="primary" onClick={() => setShowJoinModal(true)}>Join with Invite Code</Button>
                </Card>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {classes.map((c) => {
                        const title = c.subject || c.className;
                        return (
                            <Card key={c.subjectId || c.classId} className="p-6 hover:shadow-md transition-shadow">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-500/10 rounded-full flex items-center justify-center text-indigo-600 dark:text-indigo-300 font-bold text-sm">
                                        {(title?.[0] || "C").toUpperCase()}
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="font-semibold text-gray-900 truncate">{title}</h3>
                                        <p className="text-gray-500 text-xs truncate">
                                            {c.teacherName}
                                            {c.sectionName ? ` · ${c.sectionName}` : c.teacherInstitute ? ` · ${c.teacherInstitute}` : ""}
                                        </p>
                                    </div>
                                </div>

                                {(c.groupName || (c.meetings && c.meetings.length > 0)) && (
                                    <div className="mb-3 space-y-1">
                                        {c.groupName && (
                                            <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                                Group {c.groupName}
                                            </span>
                                        )}
                                        {c.meetings && c.meetings.length > 0 && (
                                            <p className="truncate text-xs text-gray-500">🗓 {meetingSummary(c.meetings)}</p>
                                        )}
                                    </div>
                                )}

                                {!c.subject && c.classDescription && (
                                    <p className="text-xs text-gray-500 mb-3 line-clamp-2">{c.classDescription}</p>
                                )}

                                <div className="flex gap-2">
                                    <Button
                                        variant="primary"
                                        className="flex-1"
                                        onClick={() => router.push(`/classroom/${c.classId}`)}
                                    >
                                        Enter
                                    </Button>
                                    <Button variant="outline" onClick={() => handleLeave(c)} className="text-red-600">
                                        Leave
                                    </Button>
                                </div>
                            </Card>
                        );
                    })}
                </div>
            )}

            {showJoinModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowJoinModal(false)}>
                    <Card className="w-full max-w-md mx-4 p-6" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-lg font-semibold text-gray-900 mb-1">Join a class</h3>
                        <p className="text-gray-500 text-sm mb-4">
                            Enter the code from your teacher. A <span className="font-mono">GRP-</span> code joins all
                            your section&apos;s subjects at once; a <span className="font-mono">CLS-</span> code joins
                            a single class.
                        </p>
                        <input
                            type="text"
                            value={inviteCode}
                            onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                            className="w-full px-4 py-3 border border-gray-300 rounded-xl text-lg font-mono text-center tracking-widest mb-4 focus:ring-2 focus:ring-indigo-500"
                            placeholder="GRP-AB12CD34"
                        />
                        {joinError && <p className="text-red-600 text-sm mb-4">{joinError}</p>}
                        <div className="flex gap-2">
                            <Button variant="primary" className="flex-1" onClick={handleJoin} isLoading={joining} disabled={!inviteCode.trim()}>
                                Join
                            </Button>
                            <Button variant="outline" onClick={() => setShowJoinModal(false)}>Cancel</Button>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
}
