"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, Card } from "@digimine/ui";
import { patternMeta } from "@digimine/types";
import { useAuthContext } from "@/contexts/AuthContext";
import { teacherFetch } from "@/lib/api/teacherFetch";

type Item = {
    problem: { id: string; slug: string; title: string; difficulty: string; primaryPattern: string; kind: string };
    dueAt: string;
    overdueDays: number;
    repetitions: number;
    intervalDays: number;
};

export default function RevisionPage() {
    const { firebaseUser, isAuthenticated, loading } = useAuthContext();
    const [items, setItems] = useState<Item[]>([]);
    const [busy, setBusy] = useState(true);

    useEffect(() => {
        if (loading) return;
        if (!firebaseUser) {
            setBusy(false);
            return;
        }
        teacherFetch(firebaseUser, "/api/practice/revision")
            .then((r) => r.json())
            .then((d) => setItems(Array.isArray(d.items) ? d.items : []))
            .catch(() => setItems([]))
            .finally(() => setBusy(false));
    }, [firebaseUser, loading]);

    return (
        <main className="bg-slate-50 min-h-screen">
            <section className="border-b border-slate-200 bg-white">
                <div className="container-page py-8">
                    <Link href="/practice" className="text-xs text-slate-500 hover:text-slate-900">← Practice hub</Link>
                    <h1 className="mt-1 font-display text-2xl font-bold text-slate-900">Revision Radar</h1>
                    <p className="mt-1 text-sm text-slate-500">
                        Problems due for a spaced-repetition review. Re-solving them right before you&apos;d forget is what
                        turns practice into permanent recall.
                    </p>
                </div>
            </section>

            <div className="container-page py-8">
                {!loading && !isAuthenticated ? (
                    <Card className="p-12 text-center">
                        <Link href="/login?redirect=/practice/revision" className="font-semibold text-primary-700 hover:underline">Sign in</Link>{" "}
                        to see your revision queue.
                    </Card>
                ) : busy ? (
                    <Card className="p-12 text-center text-sm text-slate-500">Loading…</Card>
                ) : items.length === 0 ? (
                    <Card className="p-12 text-center">
                        <p className="text-slate-600">🎉 Nothing due right now.</p>
                        <p className="mt-1 text-sm text-slate-500">Solve more problems — they&apos;ll come back here on the forgetting curve.</p>
                        <Link href="/practice/problems" className="mt-4 inline-block">
                            <Button variant="primary">Solve problems</Button>
                        </Link>
                    </Card>
                ) : (
                    <div className="space-y-3">
                        {items.map((it) => (
                            <Card key={it.problem.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <Link href={`/practice/problems/${it.problem.slug}`} className="font-medium text-slate-900 hover:text-primary-700">
                                        {it.problem.title}
                                    </Link>
                                    <p className="text-xs text-slate-500">
                                        {patternMeta(it.problem.primaryPattern as any)?.label} · {it.problem.difficulty} ·
                                        {" "}reviewed {it.repetitions}× · interval {it.intervalDays}d
                                    </p>
                                </div>
                                <div className="flex items-center gap-3">
                                    {it.overdueDays > 0 && (
                                        <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">
                                            {it.overdueDays}d overdue
                                        </span>
                                    )}
                                    <Link href={`/practice/problems/${it.problem.slug}`}>
                                        <Button variant="primary" size="sm">Review</Button>
                                    </Link>
                                </div>
                            </Card>
                        ))}
                    </div>
                )}
            </div>
        </main>
    );
}
