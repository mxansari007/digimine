"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Button, Card, useToast } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { ClassroomShell } from "@/components/classroom/ui";
import {
    Avatar,
    MemberRow,
    TeacherBadge,
    startConversation,
} from "@/components/classroom/community";

function ClassroomPeopleInner() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const toast = useToast();
    const { firebaseUser, loading: authLoading } = useAuthContext();
    const classId = params.classId as string;
    const fromTeacher = searchParams.get("from") === "teacher";

    const [members, setMembers] = useState<MemberRow[]>([]);
    const [me, setMe] = useState("");
    const [viewerRole, setViewerRole] = useState("student");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [busyId, setBusyId] = useState<string | null>(null);
    const [menuId, setMenuId] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!firebaseUser) return;
        try {
            const token = await firebaseUser.getIdToken();
            const res = await fetch(`/api/classes/${classId}/members`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Couldn't load the class roster.");
            setMembers(data.members || []);
            setMe(data.me || "");
            setViewerRole(data.viewerRole || "student");
        } catch (err: any) {
            setError(err.message || "Couldn't load the class roster.");
        } finally {
            setLoading(false);
        }
    }, [firebaseUser, classId]);

    useEffect(() => {
        if (authLoading) return;
        if (!firebaseUser) {
            router.push(`/login?redirect=${encodeURIComponent(`/classroom/${classId}/people`)}`);
            return;
        }
        load();
    }, [authLoading, firebaseUser, router, classId, load]);

    const message = async (uid: string) => {
        if (!firebaseUser) return;
        try {
            const convoId = await startConversation(firebaseUser, uid);
            if (convoId) router.push(`/messages?open=${convoId}`);
        } catch (err: any) {
            toast.error(err.message);
        }
    };

    const setBlock = async (m: MemberRow, patch: { threads?: boolean; dm?: boolean }) => {
        if (!firebaseUser) return;
        setBusyId(m.id);
        try {
            const token = await firebaseUser.getIdToken();
            const res = await fetch(`/api/classes/${classId}/members/${m.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify(patch),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Couldn't update.");
            setMembers((prev) => prev.map((x) => (x.id === m.id ? { ...x, block: data.block } : x)));
            const firstName = m.name.split(" ")[0];
            if (patch.threads !== undefined) {
                toast.success(patch.threads ? `${firstName} can't post in discussions.` : `${firstName} can post again.`);
            } else if (patch.dm !== undefined) {
                toast.success(patch.dm ? `${firstName} can't message the class.` : `${firstName} can message again.`);
            }
        } catch (err: any) {
            toast.error(err.message);
        } finally {
            setBusyId(null);
        }
    };

    const isModerator = viewerRole !== "student";
    const students = members.filter((m) => m.role === "student");
    const mutedCount = students.filter((m) => m.block && (m.block.threads || m.block.dm)).length;

    return (
        <ClassroomShell
            backHref={fromTeacher ? `/teacher/classes/${classId}` : `/classroom/${classId}`}
            backLabel={fromTeacher ? "Class" : "Classroom"}
            eyebrow={isModerator ? "Moderating" : "Classroom"}
            title="People"
            subtitle={
                isModerator
                    ? `${students.length} student${students.length === 1 ? "" : "s"}. Message anyone, or mute a student from discussions and messages.`
                    : `${students.length} student${students.length === 1 ? "" : "s"} and your teacher — message anyone directly.`
            }
        >
            {error && <Card intent="danger" className="p-4 text-sm text-danger-700">{error}</Card>}

            {isModerator && mutedCount > 0 && (
                <p className="text-xs text-slate-500">
                    <span className="font-semibold text-accent-700 dark:text-accent-300">{mutedCount}</span>{" "}
                    student{mutedCount === 1 ? " is" : "s are"} currently muted.
                </p>
            )}

            {loading ? (
                <div className="space-y-2">
                    {[0, 1, 2].map((i) => (
                        <div key={i} className="h-20 animate-pulse rounded-2xl bg-slate-200/60 dark:bg-slate-800" />
                    ))}
                </div>
            ) : (
                <div className="overflow-visible rounded-2xl border border-slate-200 dark:border-slate-700 bg-surface shadow-soft-sm">
                    {members.map((m, i) => {
                        const muted = m.block && (m.block.threads || m.block.dm);
                        return (
                            <div
                                key={m.id}
                                className={`flex items-center gap-3.5 px-4 py-3.5 ${
                                    i > 0 ? "border-t border-slate-100 dark:border-slate-800" : ""
                                }`}
                            >
                                <Avatar name={m.name} src={m.avatarUrl} size="lg" />
                                <div className="min-w-0 flex-1">
                                    <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-gray-900">
                                        {m.name}
                                        {m.role === "teacher" && <TeacherBadge />}
                                        {m.id === me && <span className="text-[11px] font-normal text-slate-400">(you)</span>}
                                        {muted && (
                                            <span className="rounded bg-accent-50 dark:bg-accent-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-700 dark:text-accent-300">
                                                Muted
                                            </span>
                                        )}
                                    </p>
                                    {(m.headline || m.college) && (
                                        <p className="truncate text-xs text-slate-500">
                                            {m.headline || ""}
                                            {m.headline && m.college ? " · " : ""}
                                            {m.college || ""}
                                            {m.gradYear ? ` '${String(m.gradYear).slice(-2)}` : ""}
                                        </p>
                                    )}
                                    {m.block && muted && (
                                        <p className="mt-0.5 text-[11px] text-accent-700 dark:text-accent-300">
                                            {[m.block.threads ? "no discussions" : null, m.block.dm ? "no messages" : null]
                                                .filter(Boolean)
                                                .join(" · ")}
                                        </p>
                                    )}
                                    {m.skills.length > 0 && (
                                        <div className="mt-1 flex flex-wrap gap-1">
                                            {m.skills.slice(0, 5).map((s) => (
                                                <span
                                                    key={s}
                                                    className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-600 dark:text-slate-300"
                                                >
                                                    {s}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div className="flex shrink-0 items-center gap-2">
                                    {m.id !== me && (
                                        <Button variant="outline" size="sm" onClick={() => message(m.id)}>
                                            Message
                                        </Button>
                                    )}

                                    {/* Teacher moderation menu */}
                                    {isModerator && m.role === "student" && m.block && (
                                        <div className="relative">
                                            <button
                                                type="button"
                                                onClick={() => setMenuId(menuId === m.id ? null : m.id)}
                                                aria-label={`Moderate ${m.name}`}
                                                aria-expanded={menuId === m.id}
                                                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                                            >
                                                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                                                    <circle cx="12" cy="5" r="1.6" />
                                                    <circle cx="12" cy="12" r="1.6" />
                                                    <circle cx="12" cy="19" r="1.6" />
                                                </svg>
                                            </button>
                                            {menuId === m.id && (
                                                <>
                                                    <button
                                                        type="button"
                                                        className="fixed inset-0 z-10 cursor-default"
                                                        aria-hidden
                                                        onClick={() => setMenuId(null)}
                                                    />
                                                    <div className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-popover shadow-soft-lg">
                                                        <button
                                                            type="button"
                                                            disabled={busyId === m.id}
                                                            onClick={() => setBlock(m, { threads: !m.block!.threads })}
                                                            className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left text-sm text-gray-900 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                                                        >
                                                            <span>
                                                                {m.block.threads ? "Allow in discussions" : "Mute in discussions"}
                                                                <span className="block text-[11px] text-slate-400">
                                                                    {m.block.threads ? "Can post & reply again" : "Can't post or reply"}
                                                                </span>
                                                            </span>
                                                            {m.block.threads && <span className="text-success-600">●</span>}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            disabled={busyId === m.id}
                                                            onClick={() => setBlock(m, { dm: !m.block!.dm })}
                                                            className="flex w-full items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-800 px-3.5 py-2.5 text-left text-sm text-gray-900 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                                                        >
                                                            <span>
                                                                {m.block.dm ? "Allow messaging" : "Mute messaging"}
                                                                <span className="block text-[11px] text-slate-400">
                                                                    {m.block.dm ? "Can message the class again" : "Can't message anyone here"}
                                                                </span>
                                                            </span>
                                                            {m.block.dm && <span className="text-success-600">●</span>}
                                                        </button>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </ClassroomShell>
    );
}

export default function ClassroomPeoplePage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-background" />}>
            <ClassroomPeopleInner />
        </Suspense>
    );
}
