"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button, Card } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import {
    ClassContentRow,
    ContentItemRow,
    LaneSection,
    UpNextEntry,
    UpNextRail,
    contestPhase,
    metaFor,
    shortDate,
} from "@/components/classroom/ui";
import {
    EvalRow,
    SubmissionRow,
    SubmissionStatusBadge,
    ScoreRing,
} from "@/components/projectEval/shared";
import {
    Avatar,
    TagChip,
    TeacherBadge,
    ThreadRow,
    timeAgo,
} from "@/components/classroom/community";

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

type ClassroomEval = EvalRow & { mySubmission: SubmissionRow | null };

type ContentBundle = {
    quizzes: ClassContentRow[];
    tests: ClassContentRow[];
    contests: ClassContentRow[];
    courses: ClassContentRow[];
    projectEvals: ClassroomEval[];
};

const EMPTY_CONTENT: ContentBundle = {
    quizzes: [],
    tests: [],
    contests: [],
    courses: [],
    projectEvals: [],
};

const LANE_PREVIEW = 3;
const NEW_WINDOW_MS = 14 * 24 * 3600 * 1000;

export default function ClassroomPage() {
    const params = useParams();
    const { firebaseUser, loading: authLoading } = useAuthContext();
    const classId = params.classId as string;
    const isLegacy = classId.startsWith("legacy:");
    const legacyTeacherId = isLegacy ? classId.replace(/^legacy:/, "") : "";

    const [teacher, setTeacher] = useState<TeacherShape | null>(null);
    const [classroom, setClassroom] = useState<ClassShape | null>(null);
    const [loading, setLoading] = useState(true);
    const [enrolled, setEnrolled] = useState(false);
    const [isLeaving, setIsLeaving] = useState(false);
    const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
    const [counts, setCounts] = useState({ quizzes: 0, tests: 0, contests: 0, courses: 0, projectEvals: 0 });
    const [content, setContent] = useState<ContentBundle>(EMPTY_CONTENT);
    const [board, setBoard] = useState<{ notices: ThreadRow[]; total: number } | null>(null);

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
                setCounts({ projectEvals: 0, ...(data.counts || {}) });
                setContent(EMPTY_CONTENT);
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
            setCounts({ projectEvals: 0, ...(data.counts || {}) });
            setContent({ ...EMPTY_CONTENT, ...(data.content || {}) });
        } catch (err) {
            console.error("classroom load failed", err);
            setTeacher(null);
            setClassroom(null);
        } finally {
            setLoading(false);
        }
    }, [classId, firebaseUser, isLegacy, legacyTeacherId]);

    useEffect(() => {
        // Wait for Firebase to finish restoring the session before the first
        // fetch. On a hard reload `firebaseUser` is briefly null; firing
        // loadData then would request the class without the student's id/token
        // and wrongly render the not-enrolled / not-found state.
        if (authLoading) return;
        loadData();
    }, [authLoading, loadData]);

    // Noticeboard + Discussions preview (non-blocking). One fetch feeds both
    // the announcements/resources band and the Discussions tile count.
    useEffect(() => {
        if (!firebaseUser || !enrolled || isLegacy) return;
        let cancelled = false;
        (async () => {
            try {
                const token = await firebaseUser.getIdToken();
                const res = await fetch(`/api/classes/${classId}/threads?sort=new`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                const data = await res.json();
                if (!cancelled && res.ok) {
                    const threads: ThreadRow[] = data.threads || [];
                    // The noticeboard is the teacher's broadcast surface:
                    // all announcements, plus resources the teacher shared.
                    // Student-shared resources still live in the Resources
                    // filter on the discussions board.
                    const notices = threads
                        .filter(
                            (t) =>
                                t.tag === "announcement" ||
                                (t.tag === "resource" && t.authorRole !== "student")
                        )
                        .slice(0, 4);
                    setBoard({ notices, total: threads.length });
                }
            } catch {
                /* band/tile fall back to static copy */
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [firebaseUser, enrolled, isLegacy, classId]);

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

    const basePath = `/classroom/${classId}`;

    // ── Up Next — the schedule rail. Live contests, unsubmitted projects
    // with due dates, then anything posted in the last two weeks. ──────
    const upNext = useMemo<UpNextEntry[]>(() => {
        const entries: UpNextEntry[] = [];
        const nowMs = Date.now();

        content.contests.forEach((c) => {
            const phase = contestPhase(c, nowMs);
            if (phase === "live") {
                entries.push({
                    key: `contest-${c.id}`,
                    label: "LIVE",
                    tone: "live",
                    title: c.title,
                    meta: metaFor.contest(c),
                    href: `/contests/${c.slug || c.id}?classId=${classId}`,
                    action: "Join",
                });
            } else if (phase === "upcoming") {
                entries.push({
                    key: `contest-${c.id}`,
                    label: shortDate(c.startTime).toUpperCase(),
                    tone: "due",
                    title: c.title,
                    meta: metaFor.contest(c),
                    href: `/contests/${c.slug || c.id}?classId=${classId}`,
                    action: "View",
                });
            }
        });

        content.projectEvals.forEach((ev) => {
            if (ev.status !== "published") return;
            const sub = ev.mySubmission;
            if (sub && sub.status !== "failed") return;
            const overdue = ev.dueAt && new Date(ev.dueAt).getTime() < nowMs;
            if (overdue && !sub) return; // past-due, unsubmittable — keep off the rail
            entries.push({
                key: `eval-${ev.id}`,
                label: sub?.status === "failed" ? "RETRY" : ev.dueAt ? `DUE ${shortDate(ev.dueAt).toUpperCase()}` : "OPEN",
                tone: "due",
                title: ev.title,
                meta: `Project · ${ev.maxTotalScore} marks`,
                href: `/dashboard/project-evals/${ev.id}`,
                action: sub ? "Resubmit" : "Submit",
            });
        });

        [...content.tests, ...content.quizzes]
            .filter((r) => r.createdAt && nowMs - new Date(r.createdAt).getTime() < NEW_WINDOW_MS)
            .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
            .slice(0, 2)
            .forEach((r) => {
                const isTest = content.tests.includes(r);
                entries.push({
                    key: `${isTest ? "test" : "quiz"}-${r.id}`,
                    label: "NEW",
                    tone: "new",
                    title: r.title,
                    meta: isTest ? metaFor.test(r) : metaFor.quiz(r),
                    href: isTest
                        ? `/tests/${r.slug || r.id}?classId=${classId}`
                        : `/quizzes/${r.slug || r.id}?classId=${classId}`,
                    action: "Start",
                });
            });

        const toneRank = { live: 0, due: 1, new: 2 } as const;
        return entries.sort((a, b) => toneRank[a.tone] - toneRank[b.tone]).slice(0, 6);
    }, [content, classId]);

    const totalItems =
        counts.quizzes + counts.tests + counts.contests + counts.courses + counts.projectEvals;

    if (loading) {
        return (
            <div className="min-h-screen bg-background px-4 py-10">
                <div className="mx-auto max-w-4xl space-y-4">
                    <div className="h-28 animate-pulse rounded-2xl bg-slate-200/60 dark:bg-slate-800" />
                    <div className="h-44 animate-pulse rounded-2xl bg-slate-200/60 dark:bg-slate-800" />
                    <div className="h-44 animate-pulse rounded-2xl bg-slate-200/60 dark:bg-slate-800" />
                </div>
            </div>
        );
    }

    if (!classroom || !teacher) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background px-4">
                <Card className="max-w-sm p-8 text-center">
                    <h1 className="font-display text-lg font-semibold text-gray-900">
                        Class not found
                    </h1>
                    <p className="mt-2 text-sm text-slate-500">
                        The link may be wrong, or this class was archived by its teacher.
                    </p>
                    <Link href="/dashboard" className="mt-4 inline-block">
                        <Button variant="outline" size="sm">Back to dashboard</Button>
                    </Link>
                </Card>
            </div>
        );
    }

    const teacherName = teacher.profile?.name || "Teacher";
    const subjects = teacher.profile?.subjects || [];

    return (
        <div className="min-h-screen bg-background px-4 py-10">
            <div className="mx-auto max-w-4xl">
                {/* ── Header band ── */}
                <Link
                    href="/dashboard"
                    className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-primary-700 focus-visible:underline"
                >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Dashboard
                </Link>

                <div className="mt-4 flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
                    <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                            Classroom
                        </p>
                        <h1 className="mt-1 font-display text-2xl font-bold text-gray-900 sm:text-3xl">
                            {classroom.name}
                        </h1>
                        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500">
                            <span className="flex items-center gap-1.5">
                                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-500/20 text-[10px] font-bold text-primary-700 dark:text-primary-300">
                                    {teacherName[0]?.toUpperCase()}
                                </span>
                                {teacherName}
                            </span>
                            {teacher.profile?.institute && <span>· {teacher.profile.institute}</span>}
                            {enrolled && totalItems > 0 && (
                                <span className="font-mono text-xs">· {totalItems} items posted</span>
                            )}
                        </div>
                        {subjects.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                                {subjects.map((s) => (
                                    <span
                                        key={s}
                                        className="rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-[11px] text-slate-600 dark:text-slate-300"
                                    >
                                        {s}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Enrollment state */}
                    <div className="shrink-0">
                        {!firebaseUser ? (
                            <Link href={`/login?redirect=${encodeURIComponent(basePath)}`}>
                                <Button variant="primary" size="sm">Sign in to view work</Button>
                            </Link>
                        ) : enrolled ? (
                            !showLeaveConfirm ? (
                                <div className="flex items-center gap-3">
                                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success-700 dark:text-success-300">
                                        <span className="h-1.5 w-1.5 rounded-full bg-success-500" />
                                        Enrolled
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setShowLeaveConfirm(true)}
                                        className="text-xs text-slate-400 hover:text-danger-600 focus-visible:underline"
                                    >
                                        Leave
                                    </button>
                                </div>
                            ) : (
                                <div className="rounded-xl border border-danger-200 dark:border-danger-500/30 bg-danger-50/60 dark:bg-danger-500/10 p-3">
                                    <p className="text-xs text-danger-700 dark:text-danger-300">
                                        Leave this class? You lose access to all its work.
                                    </p>
                                    <div className="mt-2 flex justify-end gap-2">
                                        <Button variant="outline" size="sm" onClick={() => setShowLeaveConfirm(false)} disabled={isLeaving}>
                                            Stay
                                        </Button>
                                        <Button variant="danger" size="sm" onClick={handleLeave} isLoading={isLeaving}>
                                            Leave class
                                        </Button>
                                    </div>
                                </div>
                            )
                        ) : classroom.inviteCode ? (
                            <Link href={`/join/${encodeURIComponent(classroom.inviteCode)}`}>
                                <Button variant="primary" size="sm">Join this class</Button>
                            </Link>
                        ) : null}
                    </div>
                </div>

                {classroom.description && (
                    <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-500">
                        {classroom.description}
                    </p>
                )}

                {/* ── Body ── */}
                {!enrolled ? (
                    firebaseUser && (
                        <div className="mt-10 rounded-2xl border border-dashed border-slate-300 dark:border-slate-600 px-6 py-12 text-center">
                            <h2 className="font-display text-lg font-semibold text-gray-900">
                                You&apos;re not in this class yet
                            </h2>
                            <p className="mx-auto mt-1.5 max-w-sm text-sm text-slate-500">
                                Join with the invite code from your teacher to see the tests,
                                quizzes, and projects posted here.
                            </p>
                            {classroom.inviteCode && (
                                <Link href={`/join/${encodeURIComponent(classroom.inviteCode)}`} className="mt-4 inline-block">
                                    <Button variant="primary">Join this class</Button>
                                </Link>
                            )}
                        </div>
                    )
                ) : (
                    <div className="mt-8 space-y-9">
                        {/* Noticeboard — teacher announcements & shared resources */}
                        {!isLegacy && board && board.notices.length > 0 && (
                            <section aria-label="Noticeboard">
                                <div className="flex items-baseline justify-between">
                                    <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                                        Noticeboard
                                    </h2>
                                    <Link
                                        href={`${basePath}/threads?tag=announcement`}
                                        className="text-xs text-slate-500 hover:text-primary-700 focus-visible:underline"
                                    >
                                        All notices →
                                    </Link>
                                </div>
                                <div className="mt-2.5 overflow-hidden rounded-2xl border border-accent-200 dark:border-accent-500/30 bg-accent-50/40 dark:bg-accent-500/5 shadow-soft-sm">
                                    {board.notices.map((n, i) => (
                                        <Link
                                            key={n.id}
                                            href={`${basePath}/threads/${n.id}`}
                                            className={`flex items-start gap-3 px-4 py-3 transition-colors hover:bg-accent-50 dark:hover:bg-accent-500/10 focus:outline-none focus-visible:bg-accent-50 ${
                                                i > 0 ? "border-t border-accent-200/70 dark:border-accent-500/20" : ""
                                            }`}
                                        >
                                            <Avatar name={n.authorName} src={n.authorAvatar} size="sm" />
                                            <span className="min-w-0 flex-1">
                                                <span className="flex flex-wrap items-center gap-1.5">
                                                    <TagChip tag={n.tag} />
                                                    {n.isPinned && (
                                                        <span className="text-[10px] font-semibold uppercase tracking-wide text-primary-700 dark:text-primary-300">
                                                            Pinned
                                                        </span>
                                                    )}
                                                </span>
                                                <span className="mt-0.5 block truncate text-sm font-medium text-gray-900">
                                                    {n.title}
                                                </span>
                                                <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-slate-500">
                                                    <span>{n.authorName}</span>
                                                    {n.authorRole !== "student" && <TeacherBadge />}
                                                    <span>· {timeAgo(n.lastActivityAt)}</span>
                                                    {n.attachments && n.attachments.length > 0 && (
                                                        <span className="font-mono">· {n.attachments.length} img</span>
                                                    )}
                                                </span>
                                            </span>
                                            <svg className="mt-1 h-4 w-4 shrink-0 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                            </svg>
                                        </Link>
                                    ))}
                                </div>
                            </section>
                        )}

                        <UpNextRail entries={upNext} />

                        {/* Community strip — discussions + people + resources */}
                        {!isLegacy && (
                            <div className="grid gap-2.5 sm:grid-cols-3">
                                <Link
                                    href={`${basePath}/threads`}
                                    className="group flex items-center gap-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-surface px-4 py-3.5 shadow-soft-sm transition-colors hover:border-primary-300 focus-visible:ring-2 focus-visible:ring-primary-500 focus:outline-none"
                                >
                                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 dark:bg-primary-500/15 text-primary-700 dark:text-primary-300">
                                        <svg className="h-4.5 w-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 12h8m-8 4h5M7 20l-3 1 1-3.5A8.5 8.5 0 1112 20.5 8.6 8.6 0 017 20z" />
                                        </svg>
                                    </span>
                                    <span className="min-w-0">
                                        <span className="block text-sm font-medium text-gray-900">Discussions</span>
                                        <span className="block truncate text-xs text-slate-500">
                                            {board?.total
                                                ? `${board.total} ${board.total === 1 ? "post" : "posts"} · ask doubts & discuss`
                                                : "Ask doubts & discuss — start the first post"}
                                        </span>
                                    </span>
                                </Link>
                                <Link
                                    href={`${basePath}/resources`}
                                    className="group flex items-center gap-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-surface px-4 py-3.5 shadow-soft-sm transition-colors hover:border-primary-300 focus-visible:ring-2 focus-visible:ring-primary-500 focus:outline-none"
                                >
                                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 dark:bg-primary-500/15 text-primary-700 dark:text-primary-300">
                                        <svg className="h-4.5 w-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                                        </svg>
                                    </span>
                                    <span className="min-w-0">
                                        <span className="block text-sm font-medium text-gray-900">Resources</span>
                                        <span className="block truncate text-xs text-slate-500">
                                            Slide decks, PDFs &amp; videos shared in class
                                        </span>
                                    </span>
                                </Link>
                                <Link
                                    href={`${basePath}/people`}
                                    className="group flex items-center gap-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-surface px-4 py-3.5 shadow-soft-sm transition-colors hover:border-primary-300 focus-visible:ring-2 focus-visible:ring-primary-500 focus:outline-none"
                                >
                                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-50 dark:bg-accent-500/15 text-accent-700 dark:text-accent-300">
                                        <svg className="h-4.5 w-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197" />
                                        </svg>
                                    </span>
                                    <span className="min-w-0">
                                        <span className="block text-sm font-medium text-gray-900">People</span>
                                        <span className="block truncate text-xs text-slate-500">
                                            Classmates · message anyone, including {teacherName.split(" ")[0]}
                                        </span>
                                    </span>
                                </Link>
                            </div>
                        )}

                        {totalItems === 0 ? (
                            <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-600 px-6 py-14 text-center">
                                <h2 className="font-display text-lg font-semibold text-gray-900">
                                    Nothing on the board yet
                                </h2>
                                <p className="mx-auto mt-1.5 max-w-sm text-sm text-slate-500">
                                    When {teacherName} posts a mock test, quiz, contest, course, or
                                    project, it shows up here.
                                </p>
                            </div>
                        ) : (
                            <>
                                {isLegacy ? (
                                    /* Legacy classrooms have count-only data — keep navigation working. */
                                    <div className="grid gap-2.5 sm:grid-cols-2">
                                        {(
                                            [
                                                ["Quizzes", "quizzes", counts.quizzes],
                                                ["Mock tests", "tests", counts.tests],
                                                ["Contests", "contests", counts.contests],
                                                ["Courses", "courses", counts.courses],
                                            ] as const
                                        ).map(([label, path, count]) => (
                                            <Link
                                                key={path}
                                                href={`${basePath}/${path}`}
                                                className="flex items-center justify-between rounded-2xl border border-slate-200 dark:border-slate-700 bg-surface px-4 py-3.5 shadow-soft-sm transition-colors hover:border-primary-300 focus-visible:ring-2 focus-visible:ring-primary-500 focus:outline-none"
                                            >
                                                <span className="text-sm font-medium text-gray-900">{label}</span>
                                                <span className="font-mono text-xs text-slate-400">{count}</span>
                                            </Link>
                                        ))}
                                    </div>
                                ) : (
                                    <>
                                        {content.tests.length > 0 && (
                                            <LaneSection title="Mock tests" count={counts.tests} viewAllHref={`${basePath}/tests`}>
                                                {content.tests.slice(0, LANE_PREVIEW).map((r, i) => (
                                                    <ContentItemRow
                                                        key={r.id}
                                                        first={i === 0}
                                                        href={`/tests/${r.slug || r.id}?classId=${classId}`}
                                                        title={r.title}
                                                        meta={metaFor.test(r)}
                                                    />
                                                ))}
                                            </LaneSection>
                                        )}

                                        {content.quizzes.length > 0 && (
                                            <LaneSection title="Quizzes" count={counts.quizzes} viewAllHref={`${basePath}/quizzes`}>
                                                {content.quizzes.slice(0, LANE_PREVIEW).map((r, i) => (
                                                    <ContentItemRow
                                                        key={r.id}
                                                        first={i === 0}
                                                        href={`/quizzes/${r.slug || r.id}?classId=${classId}`}
                                                        title={r.title}
                                                        meta={metaFor.quiz(r)}
                                                    />
                                                ))}
                                            </LaneSection>
                                        )}

                                        {content.contests.length > 0 && (
                                            <LaneSection title="Contests" count={counts.contests} viewAllHref={`${basePath}/contests`}>
                                                {content.contests.slice(0, LANE_PREVIEW).map((r, i) => {
                                                    const phase = contestPhase(r);
                                                    return (
                                                        <ContentItemRow
                                                            key={r.id}
                                                            first={i === 0}
                                                            href={`/contests/${r.slug || r.id}?classId=${classId}`}
                                                            title={r.title}
                                                            meta={metaFor.contest(r)}
                                                            right={
                                                                phase === "live" ? (
                                                                    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-danger-600 dark:text-danger-400">
                                                                        <span className="relative flex h-1.5 w-1.5">
                                                                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger-500 opacity-60 motion-reduce:animate-none" />
                                                                            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-danger-500" />
                                                                        </span>
                                                                        LIVE
                                                                    </span>
                                                                ) : undefined
                                                            }
                                                        />
                                                    );
                                                })}
                                            </LaneSection>
                                        )}

                                        {content.projectEvals.length > 0 && (
                                            <LaneSection
                                                title="Projects"
                                                count={counts.projectEvals}
                                                viewAllHref={`${basePath}/project-evals`}
                                            >
                                                {content.projectEvals.slice(0, LANE_PREVIEW).map((ev, i) => {
                                                    const sub = ev.mySubmission;
                                                    const finalScore =
                                                        sub?.teacherReview?.finalScore ?? sub?.totalScore ?? null;
                                                    return (
                                                        <ContentItemRow
                                                            key={ev.id}
                                                            first={i === 0}
                                                            href={`/dashboard/project-evals/${ev.id}`}
                                                            title={ev.title}
                                                            meta={`${ev.maxTotalScore} marks${ev.dueAt ? ` · due ${shortDate(ev.dueAt)}` : ""}`}
                                                            right={
                                                                sub ? (
                                                                    sub.status === "scored" && finalScore !== null ? (
                                                                        <ScoreRing
                                                                            score={finalScore}
                                                                            maxScore={sub.maxTotalScore ?? ev.maxTotalScore}
                                                                        />
                                                                    ) : (
                                                                        <SubmissionStatusBadge status={sub.status} />
                                                                    )
                                                                ) : (
                                                                    <span className="text-[11px] text-slate-400">not submitted</span>
                                                                )
                                                            }
                                                        />
                                                    );
                                                })}
                                            </LaneSection>
                                        )}

                                        {content.courses.length > 0 && (
                                            <LaneSection title="Courses" count={counts.courses} viewAllHref={`${basePath}/courses`}>
                                                {content.courses.slice(0, LANE_PREVIEW).map((r, i) => (
                                                    <ContentItemRow
                                                        key={r.id}
                                                        first={i === 0}
                                                        href={`${basePath}/content/${r.id}?type=course`}
                                                        title={r.title}
                                                        meta={metaFor.course(r)}
                                                    />
                                                ))}
                                            </LaneSection>
                                        )}
                                    </>
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
