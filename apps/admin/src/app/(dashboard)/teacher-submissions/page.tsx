"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { collection, getDocs, query, where, orderBy, collectionGroup } from "firebase/firestore";
import { db } from "@/lib/firebase/client";

type SubmissionType = "quiz" | "test" | "course" | "contest" | "question";

interface Submission {
    id: string;
    type: SubmissionType;
    teacherId: string;
    title: string;
    description?: string;
    suggestedPrice: number;
    submittedForReviewAt: Date | null;
    status: string;
}

export default function TeacherSubmissionsPage() {
    const { isAdmin } = useAdminAuth();
    const [submissions, setSubmissions] = useState<Submission[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeFilter, setActiveFilter] = useState<SubmissionType | "all">("all");

    useEffect(() => {
        if (!isAdmin) return;
        loadSubmissions();
    }, [isAdmin]);

    const loadSubmissions = async () => {
        setLoading(true);
        const results: Submission[] = [];

        // Query main content collections
        const collections: { col: string; type: SubmissionType }[] = [
            { col: "quizzes", type: "quiz" },
            { col: "tests", type: "test" },
            { col: "courses", type: "course" },
            { col: "contests", type: "contest" },
        ];

        for (const { col, type } of collections) {
            const q = query(
                collection(db, col),
                where("visibility", "==", "submitted_for_review"),
                orderBy("submittedForReviewAt", "desc")
            );
            try {
                const snapshot = await getDocs(q);
                snapshot.docs.forEach((docSnap) => {
                    const d = docSnap.data();
                    results.push({
                        id: docSnap.id,
                        type,
                        teacherId: d.teacherId || "",
                        title: d.title || d.name || "Untitled",
                        description: d.description || "",
                        suggestedPrice: d.suggestedPrice || 0,
                        submittedForReviewAt: d.submittedForReviewAt?.toDate?.() || null,
                        status: d.visibility || "submitted_for_review",
                    });
                });
            } catch {
                // Ignore index errors
            }
        }

        // Query teacher questions via collection group
        try {
            const qg = query(
                collectionGroup(db, "questions"),
                where("visibility", "==", "submitted_for_review"),
                orderBy("submittedForReviewAt", "desc")
            );
            const snapshot = await getDocs(qg);
            snapshot.docs.forEach((docSnap) => {
                const d = docSnap.data();
                // Extract teacherId from path: teachers/{teacherId}/questions/{questionId}
                const pathParts = docSnap.ref.path.split("/");
                const teacherId = pathParts.length >= 2 ? pathParts[1] : "";
                results.push({
                    id: docSnap.id,
                    type: "question",
                    teacherId,
                    title: d.title || d.questionText?.slice(0, 60) || "Untitled Question",
                    description: d.questionText || "",
                    suggestedPrice: d.suggestedPrice || 0,
                    submittedForReviewAt: d.submittedForReviewAt?.toDate?.() || null,
                    status: d.visibility || "submitted_for_review",
                });
            });
        } catch {
            // Collection group queries may need index
        }

        // Sort all by submitted date
        results.sort((a, b) => {
            const aTime = a.submittedForReviewAt?.getTime?.() || 0;
            const bTime = b.submittedForReviewAt?.getTime?.() || 0;
            return bTime - aTime;
        });

        setSubmissions(results);
        setLoading(false);
    };

    const filtered = activeFilter === "all" ? submissions : submissions.filter((s) => s.type === activeFilter);

    const filters: { id: SubmissionType | "all"; label: string; count: number }[] = [
        { id: "all", label: "All", count: submissions.length },
        { id: "quiz", label: "Quizzes", count: submissions.filter((s) => s.type === "quiz").length },
        { id: "test", label: "Tests", count: submissions.filter((s) => s.type === "test").length },
        { id: "course", label: "Courses", count: submissions.filter((s) => s.type === "course").length },
        { id: "contest", label: "Contests", count: submissions.filter((s) => s.type === "contest").length },
        { id: "question", label: "Questions", count: submissions.filter((s) => s.type === "question").length },
    ];

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-slate-950">Teacher Submissions</h1>
                <span className="text-sm text-slate-500">{submissions.length} pending</span>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1">
                {filters.map((f) => (
                    <button
                        key={f.id}
                        onClick={() => setActiveFilter(f.id)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                            activeFilter === f.id
                                ? "bg-primary-600 text-white"
                                : "border border-slate-200 bg-white text-slate-600 hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700"
                        }`}
                    >
                        {f.label} {f.count > 0 && <span className="ml-1 opacity-70">({f.count})</span>}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="flex items-center justify-center h-64">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-400" />
                </div>
            ) : filtered.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-slate-500 shadow-sm">
                    No pending submissions in this category.
                </div>
            ) : (
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50">
                            <tr className="border-b border-slate-100">
                                <th className="px-5 py-3 text-left font-medium text-slate-500">Title</th>
                                <th className="px-5 py-3 text-left font-medium text-slate-500">Type</th>
                                <th className="px-5 py-3 text-left font-medium text-slate-500">Teacher</th>
                                <th className="px-5 py-3 text-left font-medium text-slate-500">Price</th>
                                <th className="px-5 py-3 text-left font-medium text-slate-500">Submitted</th>
                                <th className="px-5 py-3 text-left font-medium text-slate-500">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((sub) => (
                                <tr key={`${sub.type}-${sub.id}`} className="border-b border-slate-100 hover:bg-primary-50/30">
                                    <td className="max-w-xs truncate px-5 py-3 font-medium text-slate-800">{sub.title}</td>
                                    <td className="px-5 py-3">
                                        <span className={`px-2 py-0.5 rounded-full text-xs capitalize ${getTypeBadge(sub.type)}`}>
                                            {sub.type}
                                        </span>
                                    </td>
                                    <td className="px-5 py-3 text-slate-600">{sub.teacherId.slice(0, 12)}...</td>
                                    <td className="px-5 py-3 text-slate-600">₹{sub.suggestedPrice}</td>
                                    <td className="px-5 py-3 text-slate-600">
                                        {sub.submittedForReviewAt?.toLocaleDateString?.() || "—"}
                                    </td>
                                    <td className="px-5 py-3">
                                        <Link
                                            href={`/teacher-submissions/${sub.id}?type=${sub.type}&teacherId=${sub.teacherId}`}
                                            className="text-sm font-medium text-primary-700 hover:text-primary-800"
                                        >
                                            Review →
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

function getTypeBadge(type: SubmissionType) {
    switch (type) {
        case "quiz":
            return "bg-primary-50 text-primary-700 ring-1 ring-primary-200";
        case "test":
            return "bg-amber-50 text-amber-700 ring-1 ring-amber-200";
        case "course":
            return "bg-accent-50 text-accent-700 ring-1 ring-accent-200";
        case "contest":
            return "bg-slate-100 text-slate-700 ring-1 ring-slate-200";
        case "question":
            return "bg-primary-50 text-primary-700 ring-1 ring-primary-200";
        default:
            return "bg-slate-100 text-slate-600 ring-1 ring-slate-200";
    }
}
