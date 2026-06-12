"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import {
    ClassroomShell,
    ContentItemRow,
    contestPhase,
    metaFor,
    type ClassContentRow,
} from "@/components/classroom/ui";

export default function ClassroomContestsPage() {
    const params = useParams();
    const router = useRouter();
    const { firebaseUser, loading: authLoading } = useAuthContext();
    const classId = params.classId as string;
    const isLegacy = classId.startsWith("legacy:");
    const legacyTeacherId = isLegacy ? classId.replace(/^legacy:/, "") : "";

    const [items, setItems] = useState<ClassContentRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        if (authLoading) return;
        if (!firebaseUser) {
            router.push(`/login?redirect=${encodeURIComponent(`/classroom/${classId}/contests`)}`);
            return;
        }
        const authUser = firebaseUser;

        async function loadItems() {
            setLoading(true);
            setError("");
            try {
                const token = await authUser.getIdToken();
                const url = isLegacy
                    ? `/api/classroom/${legacyTeacherId}/content-list?type=contests`
                    : `/api/classes/${classId}/content-list?type=contests`;
                const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Could not load contests.");
                setItems(data.items || []);
            } catch (err) {
                setItems([]);
                setError(err instanceof Error ? err.message : "Could not load contests.");
            } finally {
                setLoading(false);
            }
        }

        loadItems();
    }, [authLoading, firebaseUser, router, classId, isLegacy, legacyTeacherId]);

    const attemptQuery = isLegacy ? `teacherId=${legacyTeacherId}` : `classId=${classId}`;

    // Live first, then upcoming by start time, then past.
    const ordered = [...items].sort((a, b) => {
        const rank = { live: 0, upcoming: 1, ended: 2 } as const;
        const d = rank[contestPhase(a)] - rank[contestPhase(b)];
        if (d !== 0) return d;
        return (a.startTime || "").localeCompare(b.startTime || "");
    });

    return (
        <ClassroomShell
            backHref={`/classroom/${classId}`}
            backLabel="Classroom"
            title="Contests"
            subtitle="Timed competitions with a leaderboard — everyone attempts the same paper in the same window."
        >
            {loading ? (
                <div className="space-y-2">
                    {[0, 1].map((i) => (
                        <div key={i} className="h-16 animate-pulse rounded-2xl bg-slate-200/60 dark:bg-slate-800" />
                    ))}
                </div>
            ) : error ? (
                <Card intent="danger" className="p-5 text-sm text-danger-700">{error}</Card>
            ) : ordered.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-600 px-6 py-12 text-center">
                    <h2 className="font-display text-base font-semibold text-gray-900">No contests yet</h2>
                    <p className="mt-1.5 text-sm text-slate-500">
                        When your teacher schedules a contest for this class, it appears here with
                        its start time.
                    </p>
                </div>
            ) : (
                <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-surface shadow-soft-sm">
                    {ordered.map((item, i) => {
                        const phase = contestPhase(item);
                        return (
                            <ContentItemRow
                                key={item.id}
                                first={i === 0}
                                href={`/contests/${item.slug || item.id}?${attemptQuery}`}
                                title={item.title}
                                meta={metaFor.contest(item)}
                                right={
                                    phase === "live" ? (
                                        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-danger-600 dark:text-danger-400">
                                            <span className="relative flex h-1.5 w-1.5">
                                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger-500 opacity-60 motion-reduce:animate-none" />
                                                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-danger-500" />
                                            </span>
                                            LIVE
                                        </span>
                                    ) : phase === "ended" ? (
                                        <span className="text-[11px] text-slate-400">ended</span>
                                    ) : undefined
                                }
                            />
                        );
                    })}
                </div>
            )}
        </ClassroomShell>
    );
}
