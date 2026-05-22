"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, SkeletonList } from "@digimine/ui";

type Sheet = {
    id: string;
    slug: string;
    kind: string;
    title: string;
    description: string;
    coverImageUrl: string | null;
    problemCount: number;
    tags: string[];
    isOfficial: boolean;
};

export default function SheetsPage() {
    const [items, setItems] = useState<Sheet[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch("/api/practice/sheets")
            .then((r) => r.json())
            .then((d) => setItems(Array.isArray(d.items) ? d.items : []))
            .catch(() => setItems([]))
            .finally(() => setLoading(false));
    }, []);

    return (
        <main className="bg-slate-50 min-h-screen">
            <section className="border-b border-slate-200 bg-white">
                <div className="container-page py-8">
                    <Link href="/practice" className="text-xs text-slate-500 hover:text-slate-900">← Practice hub</Link>
                    <h1 className="mt-1 font-display text-2xl font-bold text-slate-900">Curated Sheets</h1>
                    <p className="mt-1 text-sm text-slate-500">
                        Structured, ordered paths from fundamentals to interview-ready. Every problem you solve from
                        a sheet still feeds your Mastery Map and Revision Radar.
                    </p>
                </div>
            </section>

            <div className="container-page py-8">
                {loading ? (
                    <Card className="p-4"><SkeletonList rows={6} /></Card>
                ) : items.length === 0 ? (
                    <Card className="p-12 text-center text-sm text-slate-500">No sheets published yet.</Card>
                ) : (
                    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                        {items.map((s) => (
                            <Link key={s.id} href={`/practice/sheets/${s.slug}`}>
                                <Card className="h-full overflow-hidden flex flex-col hover:border-primary-300">
                                    {s.coverImageUrl ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={s.coverImageUrl} alt={s.title} className="aspect-[16/9] w-full object-cover" />
                                    ) : (
                                        <div className="aspect-[16/9] w-full bg-gradient-to-br from-primary-100 to-amber-100" />
                                    )}
                                    <div className="p-5 flex flex-col flex-1">
                                        <div className="flex items-center gap-2">
                                            {s.isOfficial && <span className="chip-info text-[10px]">Official</span>}
                                            <span className="text-[10px] uppercase tracking-wider text-slate-400">{s.kind}</span>
                                        </div>
                                        <h3 className="mt-1 font-semibold text-slate-900">{s.title}</h3>
                                        <p className="mt-1 text-sm text-slate-500 line-clamp-2 flex-1">{s.description}</p>
                                        <p className="mt-3 text-xs text-slate-400">{s.problemCount} problems</p>
                                    </div>
                                </Card>
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </main>
    );
}
