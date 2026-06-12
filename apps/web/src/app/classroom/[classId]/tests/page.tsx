"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import {
    ClassroomShell,
    ContentItemRow,
    metaFor,
    type ClassContentRow,
} from "@/components/classroom/ui";

export default function ClassroomTestsPage() {
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
            router.push(`/login?redirect=${encodeURIComponent(`/classroom/${classId}/tests`)}`);
            return;
        }
        const authUser = firebaseUser;

        async function loadItems() {
            setLoading(true);
            setError("");
            try {
                const token = await authUser.getIdToken();
                const url = isLegacy
                    ? `/api/classroom/${legacyTeacherId}/content-list?type=tests`
                    : `/api/classes/${classId}/content-list?type=tests`;
                const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Could not load tests.");
                setItems(data.items || []);
            } catch (err) {
                setItems([]);
                setError(err instanceof Error ? err.message : "Could not load tests.");
            } finally {
                setLoading(false);
            }
        }

        loadItems();
    }, [authLoading, firebaseUser, router, classId, isLegacy, legacyTeacherId]);

    const attemptQuery = isLegacy ? `teacherId=${legacyTeacherId}` : `classId=${classId}`;

    return (
        <ClassroomShell
            backHref={`/classroom/${classId}`}
            backLabel="Classroom"
            title="Mock tests"
            subtitle="Timed, exam-style series posted by your teacher. Results land in your dashboard."
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
                    <h2 className="font-display text-base font-semibold text-gray-900">
                        No mock tests yet
                    </h2>
                    <p className="mt-1.5 text-sm text-slate-500">
                        When your teacher publishes a test series to this class, it appears here.
                    </p>
                </div>
            ) : (
                <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-surface shadow-soft-sm">
                    {items.map((item, i) => (
                        <ContentItemRow
                            key={item.id}
                            first={i === 0}
                            href={`/tests/${item.slug || item.id}?${attemptQuery}`}
                            title={item.title}
                            meta={metaFor.test(item)}
                        />
                    ))}
                </div>
            )}
        </ClassroomShell>
    );
}
