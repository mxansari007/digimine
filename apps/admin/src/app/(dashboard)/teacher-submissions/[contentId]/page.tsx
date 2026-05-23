"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { doc, getDoc, setDoc, updateDoc, collection, getDocs, query, orderBy, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

export default function ReviewContentPage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const router = useRouter();
    const { user } = useAdminAuth();
    const contentId = params.contentId as string;
    const contentType = (searchParams.get("type") || "quiz") as "quiz" | "test" | "course" | "contest" | "question";
    const teacherId = searchParams.get("teacherId") || "";

    const [content, setContent] = useState<any>(null);
    const [previewItems, setPreviewItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [finalPrice, setFinalPrice] = useState("");
    const [rejectReason, setRejectReason] = useState("");
    const [actionLoading, setActionLoading] = useState(false);

    useEffect(() => {
        loadContent();
    }, [contentId, contentType, teacherId]);

    const loadContent = async () => {
        setLoading(true);

        if (contentType === "question") {
            // Teacher question is in a subcollection
            const snap = await getDoc(doc(db, "teachers", teacherId, "questions", contentId));
            if (snap.exists()) {
                const data = snap.data();
                setContent(data);
                // Teachers contribute publicly for free. Admin can override
                // pricing if/when they decide to monetise the asset.
                setFinalPrice("0");
                setPreviewItems([{ ...data, id: snap.id }]);
            }
        } else {
            const collectionName = contentType === "test" ? "tests" : `${contentType}s`;
            const snap = await getDoc(doc(db, collectionName, contentId));
            if (snap.exists()) {
                const data = snap.data();
                setContent(data);
                // Teachers contribute publicly for free. Admin can override
                // pricing if/when they decide to monetise the asset.
                setFinalPrice("0");

                // Load preview items based on content type
                if (contentType === "quiz") {
                    const qSnap = await getDocs(query(collection(db, "quizzes", contentId, "questions"), orderBy("order", "asc")));
                    setPreviewItems(qSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
                } else if (contentType === "test") {
                    const tSnap = await getDocs(query(collection(db, "tests", contentId, "tests"), orderBy("order", "asc")));
                    setPreviewItems(tSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
                } else if (contentType === "course") {
                    const cSnap = await getDocs(query(collection(db, "courses", contentId, "chapters"), orderBy("order", "asc")));
                    setPreviewItems(cSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
                } else if (contentType === "contest") {
                    setPreviewItems([{ ...data, id: snap.id }]);
                }
            }
        }
        setLoading(false);
    };

    const getContentRef = () => {
        if (contentType === "question") {
            return doc(db, "teachers", teacherId, "questions", contentId);
        }
        const collectionName = contentType === "test" ? "tests" : `${contentType}s`;
        return doc(db, collectionName, contentId);
    };

    const handleApprove = async () => {
        setActionLoading(true);
        try {
            const now = Timestamp.now();
            const price = parseFloat(finalPrice) || 0;

            // 1. Update the source doc
            await updateDoc(getContentRef(), {
                visibility: "published",
                reviewStatus: "approved",
                status: "published",
                reviewedBy: user?.id || null,
                reviewedAt: now,
                reviewNotes: "",
                finalPrice: price,
                updatedAt: now,
            });

            // 2. Clone to public_content for marketplace discovery
            const publicRef = doc(db, "public_content", `${contentType}_${contentId}`);
            await setDoc(publicRef, {
                sourceId: contentId,
                sourceCollection: contentType === "test" ? "tests" : `${contentType}s`,
                contentType,
                teacherId: teacherId || content?.teacherId || "",
                title: content?.title || content?.name || "Untitled",
                description: content?.description || "",
                thumbnailURL: content?.thumbnailURL || "",
                price,
                tags: content?.tags || [],
                isFeatured: false,
                createdAt: now,
                approvedAt: now,
                approvedBy: user?.id || null,
            });

            router.push("/teacher-submissions");
        } catch (err) {
            console.error("Approve failed:", err);
            alert("Failed to approve: " + (err instanceof Error ? err.message : "Unknown error"));
        } finally {
            setActionLoading(false);
        }
    };

    const handleReject = async () => {
        if (!rejectReason.trim()) {
            alert("Please provide a rejection reason");
            return;
        }
        setActionLoading(true);
        try {
            await updateDoc(getContentRef(), {
                visibility: "rejected",
                reviewStatus: "rejected",
                reviewedBy: user?.id || null,
                reviewedAt: Timestamp.now(),
                reviewNotes: rejectReason.trim(),
                updatedAt: Timestamp.now(),
            });
            router.push("/teacher-submissions");
        } catch (err) {
            console.error("Reject failed:", err);
            alert("Failed to reject: " + (err instanceof Error ? err.message : "Unknown error"));
        } finally {
            setActionLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-400" />
            </div>
        );
    }

    if (!content) {
        return <div className="py-16 text-center text-slate-500">Content not found</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-slate-950">Review Content</h1>
                <Link
                    href="/teacher-submissions"
                    className="text-sm text-slate-500 transition-colors hover:text-primary-700"
                >
                    ← Back to submissions
                </Link>
            </div>

            {/* Metadata Card */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-start justify-between">
                    <div>
                        <h2 className="mb-1 text-lg font-semibold text-slate-950">
                            {content.title || content.name || content.questionText?.slice(0, 60) || "Untitled"}
                        </h2>
                        <p className="mb-3 text-sm text-slate-500">{content.description || content.explanation || "No description"}</p>
                        <div className="flex flex-wrap gap-3 text-sm">
                            <span className="rounded-lg bg-primary-50 px-2 py-1 text-primary-700 ring-1 ring-primary-200 capitalize">{contentType}</span>
                            <span className="rounded-lg bg-slate-100 px-2 py-1 text-slate-600">Teacher: {teacherId || content.teacherId}</span>
                            <span className="rounded-lg bg-emerald-50 px-2 py-1 text-emerald-700 ring-1 ring-emerald-200">Contributed free</span>
                            {content.difficulty && (
                                <span className="rounded-lg bg-slate-100 px-2 py-1 text-slate-600 capitalize">{content.difficulty}</span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Preview Section */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="mb-4 text-lg font-semibold text-slate-950">Content Preview</h3>
                <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                    {previewItems.length === 0 ? (
                        <p className="text-slate-500 text-sm">No preview items available.</p>
                    ) : (
                        previewItems.map((item, idx) => (
                            <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="text-xs font-bold text-primary-700">#{idx + 1}</span>
                                    {item.type && (
                                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 capitalize ring-1 ring-slate-200">{item.type}</span>
                                    )}
                                    {item.marks !== undefined && (
                                        <span className="text-xs text-slate-500">{item.marks} marks</span>
                                    )}
                                </div>
                                <p className="mb-2 text-sm font-medium text-slate-800">
                                    {item.title || item.questionText || item.text || item.name || "Untitled"}
                                </p>
                                {item.options && (
                                    <div className="space-y-1 mt-2">
                                        {item.options.map((opt: any, i: number) => (
                                            <div key={i} className={`rounded-lg px-3 py-1.5 text-sm ${opt.isCorrect ? "border border-accent-200 bg-accent-50 text-accent-700" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}>
                                                {opt.text || opt.label || opt}
                                                {opt.isCorrect && <span className="ml-2 text-xs">✓ Correct</span>}
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {item.testCases && item.testCases.length > 0 && (
                                    <div className="mt-2 space-y-1">
                                        <p className="text-xs font-medium text-slate-500">Test Cases ({item.testCases.length})</p>
                                        {item.testCases.slice(0, 3).map((tc: any, i: number) => (
                                            <div key={i} className="rounded bg-white px-2 py-1 font-mono text-xs text-slate-600 ring-1 ring-slate-200">
                                                Input: {tc.input?.slice(0, 40) || "—"} → Expected: {tc.expectedOutput?.slice(0, 40) || "—"}
                                            </div>
                                        ))}
                                        {item.testCases.length > 3 && (
                                            <p className="text-xs text-slate-500">+ {item.testCases.length - 3} more</p>
                                        )}
                                    </div>
                                )}
                                {item.content && (
                                    <p className="text-sm text-slate-400 mt-2 line-clamp-3">{item.content}</p>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Action Cards */}
            <div className="grid md:grid-cols-2 gap-6">
                <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                    <h3 className="mb-4 text-lg font-semibold text-slate-950">Approve</h3>
                    <div className="space-y-4">
                        <div>
                            <label className="mb-1 block text-sm text-slate-600">Final Price (₹)</label>
                            <input
                                type="number"
                                value={finalPrice}
                                onChange={(e) => setFinalPrice(e.target.value)}
                                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-900 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                            />
                        </div>
                        <button
                            onClick={handleApprove}
                            disabled={actionLoading}
                            className="w-full rounded-xl bg-accent-600 py-2.5 font-semibold text-white transition-colors hover:bg-accent-700"
                        >
                            {actionLoading ? "Processing..." : "Approve & Publish"}
                        </button>
                    </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                    <h3 className="mb-4 text-lg font-semibold text-slate-950">Reject</h3>
                    <div className="space-y-4">
                        <div>
                            <label className="mb-1 block text-sm text-slate-600">Reason</label>
                            <textarea
                                value={rejectReason}
                                onChange={(e) => setRejectReason(e.target.value)}
                                rows={3}
                                className="w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-900 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                                placeholder="Why is this content being rejected?"
                            />
                        </div>
                        <button
                            onClick={handleReject}
                            disabled={actionLoading}
                            className="w-full rounded-xl bg-red-600 py-2.5 font-semibold text-white transition-colors hover:bg-red-700"
                        >
                            {actionLoading ? "Processing..." : "Reject"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

