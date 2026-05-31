"use client";

import { useState, useEffect } from "react";
import { collection, getDocs, query, where, orderBy } from "firebase/firestore";
import { FileText, ClipboardList, BookOpen, Trophy } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { db } from "@/lib/firebase/client";

// Content-type → icon. Used in the fallback thumbnail tile when an item
// doesn't have a thumbnail URL of its own.
const CONTENT_TYPE_ICON: Record<string, LucideIcon> = {
    quiz: FileText,
    test: ClipboardList,
    course: BookOpen,
    contest: Trophy,
};

interface PublicContentItem {
    id: string;
    title: string;
    description: string;
    teacherName?: string;
    teacherId?: string;
    contentType: string;
    price: number;
    finalPrice?: number;
    thumbnailURL?: string;
    thumbnailUrl?: string;
}

export default function MarketplacePage() {
    const [items, setItems] = useState<PublicContentItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<string>("all");

    useEffect(() => {
        loadContent();
    }, []);

    const loadContent = async () => {
        setLoading(true);
        const q = query(
            collection(db, "public_content"),
            where("isFeatured", "==", false),
            orderBy("createdAt", "desc")
        );
        try {
            const snapshot = await getDocs(q);
            const data = snapshot.docs.map((d) => ({
                id: d.id,
                ...d.data(),
            })) as PublicContentItem[];
            setItems(data);
        } catch {
            // Fallback without index
            const snapshot = await getDocs(collection(db, "public_content"));
            const data = snapshot.docs.map((d) => ({
                id: d.id,
                ...d.data(),
            })) as PublicContentItem[];
            setItems(data);
        }
        setLoading(false);
    };

    const filteredItems = filter === "all" ? items : items.filter((i) => i.contentType === filter);

    const filters = [
        { id: "all", label: "All" },
        { id: "quiz", label: "Quizzes" },
        { id: "test", label: "Tests" },
        { id: "course", label: "Courses" },
        { id: "contest", label: "Contests" },
    ];

    return (
        <div className="min-h-screen bg-slate-950 py-12 px-4">
            <div className="max-w-6xl mx-auto">
                <div className="text-center mb-10">
                    <h1 className="text-3xl font-bold text-white mb-3">Marketplace</h1>
                    <p className="text-slate-400 max-w-xl mx-auto">
                        Discover high-quality quizzes, tests, and courses created by verified educators.
                    </p>
                </div>

                <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
                    {filters.map((f) => (
                        <button
                            key={f.id}
                            onClick={() => setFilter(f.id)}
                            className={`px-4 py-2.5 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-200 active:scale-95 ${
                                filter === f.id
                                    ? "bg-primary-600 text-white shadow-soft"
                                    : "bg-slate-900 border border-white/10 text-slate-400 hover:border-white/20 hover:text-white"
                            }`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>

                {loading ? (
                    <div className="flex items-center justify-center h-40">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-400" />
                    </div>
                ) : filteredItems.length === 0 ? (
                    <div className="text-center py-16 text-slate-400">
                        No content available yet. Check back soon!
                    </div>
                ) : (
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredItems.map((item) => (
                            <div
                                key={item.id}
                                className="bg-slate-900 border border-white/10 rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:border-primary-500/40 hover:shadow-[0_24px_60px_rgba(0,0,0,0.45)]"
                            >
                                <div className="h-40 bg-slate-800 flex items-center justify-center">
                                    {(item.thumbnailURL || item.thumbnailUrl) ? (
                                        <img src={item.thumbnailURL || item.thumbnailUrl || ""} alt={item.title} className="w-full h-full object-cover" />
                                    ) : (
                                        (() => {
                                            const Icon = CONTENT_TYPE_ICON[item.contentType] || Trophy;
                                            return (
                                                <Icon
                                                    className="h-10 w-10 text-slate-500"
                                                    strokeWidth={1.5}
                                                    aria-hidden
                                                />
                                            );
                                        })()
                                    )}
                                </div>
                                <div className="p-5">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="text-xs font-medium px-2 py-0.5 bg-primary-500/10 text-primary-300 rounded-full capitalize">
                                            {item.contentType}
                                        </span>
                                    </div>
                                    <h3 className="font-semibold text-white mb-1">{item.title}</h3>
                                    <p className="text-slate-400 text-sm mb-3 line-clamp-2">{item.description}</p>
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-slate-500">by {item.teacherName || "Educator"}</span>
                                        <span className="text-lg font-bold text-white">
                                            {(item.finalPrice || item.price) ? `₹${item.finalPrice || item.price}` : "Free"}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
