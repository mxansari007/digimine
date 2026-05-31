"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button, Card } from "@digimine/ui";
import { FileText, ClipboardList, Trophy, BookOpen } from "lucide-react";
import { useAuthContext } from "@/contexts/AuthContext";

type TeacherShape = {
    id: string;
    profile?: {
        name?: string;
        institute?: string;
        bio?: string;
        avatarUrl?: string | null;
        subjects?: string[];
    };
};

type ClassShape = {
    id: string;
    teacherId: string;
    name: string;
    description: string | null;
    inviteCode: string;
    isArchived: boolean;
};

export default function ClassroomPage() {
    const params = useParams();
    const { firebaseUser } = useAuthContext();
    const classId = params.classId as string;
    const isLegacy = classId.startsWith("legacy:");
    const legacyTeacherId = isLegacy ? classId.replace(/^legacy:/, "") : "";

    const [teacher, setTeacher] = useState<TeacherShape | null>(null);
    const [classroom, setClassroom] = useState<ClassShape | null>(null);
    const [loading, setLoading] = useState(true);
    const [enrolled, setEnrolled] = useState(false);
    const [isLeaving, setIsLeaving] = useState(false);
    const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
    const [counts, setCounts] = useState({ quizzes: 0, tests: 0, contests: 0, courses: 0 });

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            if (isLegacy) {
                const studentParam = firebaseUser ? `?studentId=${firebaseUser.uid}` : "";
                const res = await fetch(`/api/classroom/${legacyTeacherId}/page-data${studentParam}`);
                if (!res.ok) {
                    setTeacher(null);
                    setClassroom(null);
                    return;
                }
                const data = await res.json();
                setTeacher(data.teacher);
                setClassroom({
                    id: classId,
                    teacherId: legacyTeacherId,
                    name: data.teacher?.profile?.name
                        ? `${data.teacher.profile.name}'s Classroom`
                        : "Classroom",
                    description: null,
                    inviteCode: data.teacher?.inviteCode || "",
                    isArchived: false,
                });
                setEnrolled(Boolean(data.enrolled));
                setCounts(data.counts || { quizzes: 0, tests: 0, contests: 0, courses: 0 });
                return;
            }

            const studentParam = firebaseUser ? `?studentId=${firebaseUser.uid}` : "";
            const headers: HeadersInit = {};
            if (firebaseUser) {
                const token = await firebaseUser.getIdToken();
                headers.Authorization = `Bearer ${token}`;
            }
            const res = await fetch(`/api/classes/${classId}/page-data${studentParam}`, {
                headers,
            });
            if (!res.ok) {
                setTeacher(null);
                setClassroom(null);
                return;
            }
            const data = await res.json();
            setTeacher(data.teacher || null);
            setClassroom(data.class || null);
            setEnrolled(Boolean(data.enrolled));
            setCounts(data.counts || { quizzes: 0, tests: 0, contests: 0, courses: 0 });
        } catch (err) {
            console.error("classroom load failed", err);
            setTeacher(null);
            setClassroom(null);
        } finally {
            setLoading(false);
        }
    }, [classId, firebaseUser, isLegacy, legacyTeacherId]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleLeave = async () => {
        if (!firebaseUser) return;
        setIsLeaving(true);
        try {
            const token = await firebaseUser.getIdToken();
            const res = await fetch("/api/classroom/leave", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    classId: isLegacy ? null : classId,
                    teacherId: isLegacy ? legacyTeacherId : classroom?.teacherId,
                    studentId: firebaseUser.uid,
                }),
            });
            if (res.ok) {
                setEnrolled(false);
                setShowLeaveConfirm(false);
            }
        } catch (err) {
            console.error("leave failed", err);
        } finally {
            setIsLeaving(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-100 flex items-center justify-center">
                <div className="text-gray-500">Loading...</div>
            </div>
        );
    }

    if (!classroom || !teacher) {
        return (
            <div className="min-h-screen bg-slate-100 flex items-center justify-center">
                <Card className="p-8 text-center">
                    <p className="text-gray-500 mb-4">Class not found.</p>
                    <Link href="/dashboard" className="text-indigo-600">
                        ← Back
                    </Link>
                </Card>
            </div>
        );
    }

    const basePath = `/classroom/${classId}`;
    const navItems = [
        { label: "Quizzes", href: `${basePath}/quizzes`, count: counts.quizzes, Icon: FileText },
        { label: "Test Series", href: `${basePath}/tests`, count: counts.tests, Icon: ClipboardList },
        { label: "Contests", href: `${basePath}/contests`, count: counts.contests, Icon: Trophy },
        { label: "Courses", href: `${basePath}/courses`, count: counts.courses, Icon: BookOpen },
    ];

    return (
        <div className="min-h-screen bg-slate-100 py-12 px-4">
            <div className="max-w-4xl mx-auto">
                <div className="mb-4">
                    <Link
                        href="/dashboard"
                        className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-indigo-600 transition-colors"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        Back to Dashboard
                    </Link>
                </div>

                <Card className="p-8 mb-8 text-center">
                    <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-tr from-indigo-600 to-indigo-400 p-[2px]">
                        <div className="w-full h-full rounded-full bg-white flex items-center justify-center text-3xl font-bold text-indigo-700">
                            {classroom.name?.[0]?.toUpperCase() || "C"}
                        </div>
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-1">{classroom.name}</h1>
                    <p className="text-sm text-gray-500">
                        Taught by <span className="font-medium text-gray-700">{teacher.profile?.name}</span>
                        {teacher.profile?.institute ? ` · ${teacher.profile.institute}` : ""}
                    </p>
                    {classroom.description && (
                        <p className="text-gray-500 text-sm mt-2 max-w-lg mx-auto">{classroom.description}</p>
                    )}
                    {teacher.profile?.subjects && teacher.profile.subjects.length > 0 && (
                        <div className="flex flex-wrap justify-center gap-2 mt-4">
                            {teacher.profile.subjects.map((s) => (
                                <span key={s} className="px-3 py-1 bg-gray-100 rounded-full text-xs text-gray-600">
                                    {s}
                                </span>
                            ))}
                        </div>
                    )}

                    {!firebaseUser ? (
                        <Link href={`/login?redirect=${encodeURIComponent(basePath)}`}>
                            <Button variant="primary" className="mt-6">
                                Sign in to view content
                            </Button>
                        </Link>
                    ) : enrolled ? (
                        <div className="mt-6 space-y-3">
                            {!showLeaveConfirm ? (
                                <div className="flex flex-wrap items-center justify-center gap-3">
                                    <div className="inline-flex items-center gap-2 px-5 py-2 bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/25 rounded-xl text-green-700 dark:text-green-300 text-sm">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                        Enrolled
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="text-red-600 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-500/10 border-red-200 dark:border-red-500/25"
                                        onClick={() => setShowLeaveConfirm(true)}
                                    >
                                        Leave Class
                                    </Button>
                                </div>
                            ) : (
                                <div className="inline-flex flex-col items-center gap-3 p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/25 rounded-xl">
                                    <p className="text-sm text-red-700 dark:text-red-300">
                                        Are you sure you want to leave this class? You will lose access to all content.
                                    </p>
                                    <div className="flex gap-3">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setShowLeaveConfirm(false)}
                                            disabled={isLeaving}
                                        >
                                            Cancel
                                        </Button>
                                        <Button variant="danger" size="sm" onClick={handleLeave} isLoading={isLeaving}>
                                            Yes, Leave
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="mt-6 inline-flex flex-col items-center gap-2">
                            <p className="text-sm text-gray-500">You are not enrolled in this class.</p>
                            {classroom.inviteCode && (
                                <Link href={`/join/${encodeURIComponent(classroom.inviteCode)}`}>
                                    <Button variant="primary">Join with invite code</Button>
                                </Link>
                            )}
                        </div>
                    )}
                </Card>

                {enrolled && (
                    <div className="grid sm:grid-cols-2 gap-4">
                        {navItems.map((item) => (
                            <Link key={item.label} href={item.href}>
                                <Card className="p-6 hover:shadow-md transition-shadow cursor-pointer h-full">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-300">
                                                <item.Icon className="h-6 w-6" strokeWidth={2} aria-hidden />
                                            </div>
                                            <h3 className="text-lg font-semibold text-gray-900">{item.label}</h3>
                                            <p className="text-gray-500 text-sm mt-1">{item.count} available</p>
                                        </div>
                                        <svg
                                            className="w-5 h-5 text-gray-300"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                        </svg>
                                    </div>
                                </Card>
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
