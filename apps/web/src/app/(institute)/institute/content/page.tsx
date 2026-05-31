"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button, Card } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { teacherFetch } from "@/lib/api/teacherFetch";
import { HelpTutorial } from "@/components/help/HelpTutorial";
import { TUTORIALS } from "@/components/help/tutorials";

type ContentRow = {
    id: string;
    collection: string;       // "quizzes" | "tests" | "contests" | "courses"
    kind: "quiz" | "test" | "contest" | "course";
    title: string;
    status: string;
    visibility: string;
    classIds: string[];
    createdAt: string | null;
};

type Tab = "all" | "quiz" | "test" | "contest" | "course";

function statusChip(status: string) {
    if (status === "published") return "chip-success";
    if (status === "draft") return "chip-neutral";
    return "chip-warning";
}

const newPath: Record<ContentRow["kind"], string> = {
    quiz: "/institute/content/new/quiz",
    test: "/institute/content/new/test",
    contest: "/institute/content/new/contest",
    course: "/institute/content/new/course",
};

// Edit / questions live under the teacher portal — the teacher layout now
// allows institute admins through, and Firestore rules let them write to
// content stamped with their `instituteId`. So we link straight there.
const editPath = (row: ContentRow) => {
    switch (row.kind) {
        case "quiz":
            return `/teacher/content/quizzes/${row.id}/edit`;
        case "test":
            return `/teacher/content/tests/${row.id}/edit`;
        case "contest":
            return `/teacher/content/contests/${row.id}/edit`;
        case "course":
            return `/teacher/content/courses/${row.id}/edit`;
    }
};

export default function InstituteContentPage() {
    const { firebaseUser } = useAuthContext();
    const [, setInstituteId] = useState("");
    const [items, setItems] = useState<ContentRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [tab, setTab] = useState<Tab>("all");

    const load = useCallback(async () => {
        if (!firebaseUser) return;
        setLoading(true);
        setError("");
        try {
            const me = await teacherFetch(firebaseUser, "/api/institute/me");
            const meData = await me.json();
            const id = meData?.institute?.id;
            if (!id) throw new Error("No institute");
            setInstituteId(id);
            const res = await teacherFetch(
                firebaseUser,
                `/api/institute/${encodeURIComponent(id)}/content`
            );
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed");
            setItems(data.items || []);
        } catch (err: any) {
            setError(err.message || "Failed");
        } finally {
            setLoading(false);
        }
    }, [firebaseUser]);

    useEffect(() => {
        load();
    }, [load]);

    const filtered = tab === "all" ? items : items.filter((i) => i.kind === tab);

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <div className="flex items-center gap-1.5">
                        <h1 className="text-2xl font-bold text-gray-900">Centralized content</h1>
                        <HelpTutorial {...TUTORIALS.institute_content} />
                    </div>
                    <p className="mt-1 text-gray-500">
                        Quizzes, tests, contests, and courses you publish institute-wide. Target multiple classes at
                        once and let each assigned teacher facilitate.
                    </p>
                </div>
                <div className="flex gap-2">
                    <Link href={newPath.quiz}>
                        <Button variant="primary">+ New quiz</Button>
                    </Link>
                    <Link href={newPath.test}>
                        <Button variant="outline">+ New test series</Button>
                    </Link>
                </div>
            </div>

            <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-px">
                {(
                    [
                        { id: "all" as const, label: "All" },
                        { id: "quiz" as const, label: "Quizzes" },
                        { id: "test" as const, label: "Test series" },
                        { id: "contest" as const, label: "Contests" },
                        { id: "course" as const, label: "Courses" },
                    ] as { id: Tab; label: string }[]
                ).map((t) => (
                    <button
                        key={t.id}
                        onClick={() => setTab(t.id)}
                        className={`rounded-t-lg px-4 py-2 text-sm font-medium transition-colors ${
                            tab === t.id
                                ? "border-b-2 border-primary-700 text-primary-700"
                                : "text-slate-500 hover:text-slate-700"
                        }`}
                    >
                        {t.label}
                        <span className="ml-1.5 text-[10px] text-slate-400">
                            {t.id === "all" ? items.length : items.filter((i) => i.kind === t.id).length}
                        </span>
                    </button>
                ))}
            </div>

            {error && <Card className="p-4 text-sm text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-500/25 bg-rose-50 dark:bg-rose-500/10">{error}</Card>}

            {loading ? (
                <Card className="p-12 text-center text-sm text-gray-500">Loading…</Card>
            ) : filtered.length === 0 ? (
                <Card className="p-12 text-center">
                    <p className="text-gray-500 mb-3">
                        Nothing here yet. Create your first piece of institute-wide content.
                    </p>
                    <div className="inline-flex gap-2">
                        <Link href={newPath.quiz}>
                            <Button variant="primary">Create quiz</Button>
                        </Link>
                        <Link href={newPath.test}>
                            <Button variant="outline">Create test series</Button>
                        </Link>
                    </div>
                </Card>
            ) : (
                <div className="space-y-3">
                    {filtered.map((row) => (
                        <Card key={row.id} className="p-5 flex flex-wrap items-center justify-between gap-3">
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="chip-neutral">{row.kind}</span>
                                    <span className={statusChip(row.status)}>{row.status}</span>
                                    {row.visibility !== "private" && (
                                        <span className="chip-info">{row.visibility}</span>
                                    )}
                                    <span className="text-xs text-gray-400">
                                        {row.createdAt ? new Date(row.createdAt).toLocaleDateString("en-IN") : ""}
                                    </span>
                                </div>
                                <h3 className="mt-1 font-semibold text-gray-900">{row.title}</h3>
                                <p className="mt-0.5 text-[11px] text-gray-500">
                                    {row.classIds.length > 0
                                        ? `Targets ${row.classIds.length} class${row.classIds.length === 1 ? "" : "es"}`
                                        : "Not assigned to any class yet"}
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <Link href={editPath(row)}>
                                    <Button variant="outline" size="sm">
                                        Edit
                                    </Button>
                                </Link>
                                {row.kind === "quiz" && (
                                    <Link href={`/teacher/content/quizzes/${row.id}/questions`}>
                                        <Button variant="outline" size="sm">
                                            Questions
                                        </Button>
                                    </Link>
                                )}
                                {row.kind === "test" && (
                                    <Link href={`/teacher/content/tests/${row.id}/tests`}>
                                        <Button variant="outline" size="sm">
                                            Manage tests
                                        </Button>
                                    </Link>
                                )}
                            </div>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
