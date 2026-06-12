"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { ClassroomShell, ContentItemRow, shortDate } from "@/components/classroom/ui";
import {
    EvalRow,
    ScoreRing,
    SubmissionRow,
    SubmissionStatusBadge,
} from "@/components/projectEval/shared";

type Item = EvalRow & { mySubmission: SubmissionRow | null };

export default function ClassroomProjectEvalsPage() {
    const params = useParams();
    const router = useRouter();
    const { firebaseUser, loading: authLoading } = useAuthContext();
    const classId = params.classId as string;

    const [items, setItems] = useState<Item[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        if (authLoading) return;
        if (!firebaseUser) {
            router.push(`/login?redirect=${encodeURIComponent(`/classroom/${classId}/project-evals`)}`);
            return;
        }
        const authUser = firebaseUser;

        async function loadItems() {
            setLoading(true);
            setError("");
            try {
                const token = await authUser.getIdToken();
                const res = await fetch(`/api/classes/${classId}/project-evals`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Could not load project evaluations.");
                setItems(data.items || []);
            } catch (err) {
                setItems([]);
                setError(err instanceof Error ? err.message : "Could not load project evaluations.");
            } finally {
                setLoading(false);
            }
        }

        loadItems();
    }, [authLoading, firebaseUser, router, classId]);

    return (
        <ClassroomShell
            backHref={`/classroom/${classId}`}
            backLabel="Classroom"
            title="Projects"
            subtitle="Submit a GitHub repo for each project — AI reviews it against your teacher's rubric, your teacher finalizes the score."
        >
            {loading ? (
                <div className="space-y-2">
                    {[0, 1].map((i) => (
                        <div key={i} className="h-16 animate-pulse rounded-2xl bg-slate-200/60 dark:bg-slate-800" />
                    ))}
                </div>
            ) : error ? (
                <Card intent="danger" className="p-5 text-sm text-danger-700">{error}</Card>
            ) : items.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-600 px-6 py-12 text-center">
                    <h2 className="font-display text-base font-semibold text-gray-900">No projects yet</h2>
                    <p className="mt-1.5 text-sm text-slate-500">
                        When your teacher assigns a project to this class, it appears here with the
                        rubric and a place to submit your repo.
                    </p>
                </div>
            ) : (
                <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-surface shadow-soft-sm">
                    {items.map((ev, i) => {
                        const sub = ev.mySubmission;
                        const finalScore = sub?.teacherReview?.finalScore ?? sub?.totalScore ?? null;
                        return (
                            <ContentItemRow
                                key={ev.id}
                                first={i === 0}
                                href={`/dashboard/project-evals/${ev.id}`}
                                title={ev.title}
                                meta={`${ev.maxTotalScore} marks · ${ev.parameters.length} parameters${ev.dueAt ? ` · due ${shortDate(ev.dueAt)}` : ""}${ev.status === "closed" ? " · closed" : ""}`}
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
                </div>
            )}
        </ClassroomShell>
    );
}
