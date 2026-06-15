"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button, Card } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { teacherFetch } from "@/lib/api/teacherFetch";
import { getTeacher } from "@/lib/firestore/teachers";
import { ClassCreateModal } from "./ClassCreateModal";

type Meeting = { day: string; startTime: string; endTime: string; room: string | null };

type ClassRow = {
    id: string;
    teacherId: string;
    name: string;
    description: string | null;
    inviteCode: string;
    studentsCount: number;
    activeStudentsCount: number;
    isArchived: boolean;
    // New model (absent on legacy classes)
    subject?: string | null;
    sectionName?: string | null;
    groupNames?: string[];
    groupCodes?: string[];
    room?: string | null;
    meetings?: Meeting[];
    createdAt: string | null;
    updatedAt: string | null;
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

export default function TeacherClassesPage() {
    const { firebaseUser } = useAuthContext();
    const [classes, setClasses] = useState<ClassRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [showCreate, setShowCreate] = useState(false);
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

    const visible = includeArchived ? classes : classes.filter((c) => !c.isArchived);

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Classes</h1>
                    <p className="mt-1 text-gray-500">
                        Classes you teach — your own, plus any sections your institute assigned to you.
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
                <Card className="border-red-200 dark:border-red-500/25 bg-red-50 dark:bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300">{error}</Card>
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
                                    <h3 className="font-semibold text-gray-900 truncate">{c.subject || c.name}</h3>
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

                            {(c.sectionName || (c.groupNames && c.groupNames.length) || (c.meetings && c.meetings.length)) && (
                                <div className="mt-3 space-y-1.5">
                                    {(c.sectionName || (c.groupNames && c.groupNames.length)) && (
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            {c.sectionName && (
                                                <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">
                                                    {c.sectionName}
                                                </span>
                                            )}
                                            {(c.groupNames || []).map((g) => (
                                                <span
                                                    key={g}
                                                    className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                                                >
                                                    {g}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                    {c.meetings && c.meetings.length > 0 && (
                                        <p className="truncate text-xs text-gray-500">
                                            🗓{" "}
                                            {c.meetings
                                                .map((m) => `${DAY_LABEL[m.day] || m.day} ${m.startTime}`)
                                                .join(" · ")}
                                        </p>
                                    )}
                                </div>
                            )}

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
                                <p className="text-[10px] uppercase tracking-wide text-gray-400">
                                    {c.groupCodes && c.groupCodes.length ? "Class code" : "Invite code"}
                                </p>
                                <p className="font-mono text-sm font-semibold text-primary-700">{c.inviteCode}</p>
                                {c.groupCodes && c.groupCodes.length > 0 && (
                                    <div className="mt-2 border-t border-gray-200 pt-2">
                                        <p className="text-[10px] uppercase tracking-wide text-gray-400">
                                            Group codes — students join all their subjects
                                        </p>
                                        <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                                            {c.groupCodes.map((code, i) => (
                                                <span
                                                    key={code || i}
                                                    className="font-mono text-xs font-semibold text-indigo-700"
                                                >
                                                    {(c.groupNames?.[i] || "G") + ": "}
                                                    {code}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
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

            {showCreate && firebaseUser && (
                <ClassCreateModal
                    firebaseUser={firebaseUser}
                    onClose={() => setShowCreate(false)}
                    onCreated={() => {
                        setShowCreate(false);
                        load();
                    }}
                />
            )}
        </div>
    );
}
