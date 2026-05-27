"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, Card } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { teacherFetch } from "@/lib/api/teacherFetch";
import { HelpTutorial } from "@/components/help/HelpTutorial";
import { TUTORIALS } from "@/components/help/tutorials";
import {
    getTeacherQuizzes,
    getTeacherTests,
    getTeacherCourses,
    getTeacherContests,
    submitContentForReview,
    publishTeacherContent,
    unpublishTeacherContent,
    deleteTeacherContent,
    setContentClassIds,
} from "@/lib/firestore/teacherContent";

type ReviewStatus = "draft" | "pending_review" | "approved" | "rejected";
type ClassroomStatus = "draft" | "published" | "archived";
type TeacherContentCollection = "quizzes" | "tests" | "courses" | "contests";

type ClassRow = {
    id: string;
    name: string;
    inviteCode: string;
    isArchived: boolean;
};

export default function TeacherContentPage() {
    const { firebaseUser, isInstituteAdmin } = useAuthContext();
    const [tab, setTab] = useState<"quizzes" | "tests" | "contests" | "courses">("quizzes");
    const [items, setItems] = useState<any[]>([]);
    const [classes, setClasses] = useState<ClassRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionError, setActionError] = useState("");
    const [filter, setFilter] = useState<"all" | "draft" | "published" | "pending_review" | "approved" | "rejected">("all");
    const [search, setSearch] = useState("");
    const [classModal, setClassModal] = useState<{ id: string; current: string[] } | null>(null);

    useEffect(() => {
        if (!firebaseUser) return;
        loadItems();
        loadClasses();
    }, [firebaseUser, tab]);

    const loadItems = async () => {
        if (!firebaseUser) return;
        setLoading(true);
        setActionError("");
        let data: any[] = [];
        const id = firebaseUser.uid;
        switch (tab) {
            case "quizzes":
                data = await getTeacherQuizzes(id);
                break;
            case "tests":
                data = await getTeacherTests(id);
                break;
            case "contests":
                data = await getTeacherContests(id);
                break;
            case "courses":
                data = await getTeacherCourses(id);
                break;
        }
        setItems(data);
        setLoading(false);
    };

    const loadClasses = async () => {
        if (!firebaseUser) return;
        try {
            const res = await teacherFetch(firebaseUser, "/api/teacher/classes");
            const data = await res.json();
            if (res.ok) {
                setClasses(
                    (data.classes || []).filter((c: ClassRow) => !c.isArchived)
                );
            }
        } catch {
            // non-critical
        }
    };

    const collectionName: TeacherContentCollection = (tab === "tests" ? "tests" : tab) as TeacherContentCollection;

    const handleDelete = async (id: string) => {
        if (!firebaseUser?.uid) return;
        if (!confirm("Permanently delete this?")) return;
        try {
            await deleteTeacherContent(collectionName, firebaseUser.uid, id);
            loadItems();
        } catch (err) {
            setActionError(err instanceof Error ? err.message : "Could not delete this content.");
        }
    };

    const requirePublishClasses = (item: any) => {
        const ids: string[] = Array.isArray(item.classIds) ? item.classIds : [];
        return ids.length === 0;
    };

    const handlePublishClick = async (item: any) => {
        if (!firebaseUser?.uid) return;
        if (requirePublishClasses(item)) {
            // No classes selected — open the picker first.
            setClassModal({ id: item.id, current: [] });
            return;
        }
        try {
            await publishTeacherContent(collectionName, firebaseUser.uid, item.id);
            loadItems();
        } catch (err) {
            setActionError(err instanceof Error ? err.message : "Could not publish this content.");
        }
    };

    const handleUnpublish = async (id: string) => {
        if (!firebaseUser?.uid) return;
        if (!confirm("Unpublish? Students will no longer see this.")) return;
        try {
            await unpublishTeacherContent(collectionName, firebaseUser.uid, id);
            loadItems();
        } catch (err) {
            setActionError(err instanceof Error ? err.message : "Could not unpublish this content.");
        }
    };

    const handleSubmitForReview = async (id: string) => {
        if (!firebaseUser?.uid) return;
        if (!confirm("Submit for public review? An admin will review this for the main website.")) return;
        try {
            await submitContentForReview(collectionName, firebaseUser.uid, id);
            loadItems();
        } catch (err) {
            setActionError(err instanceof Error ? err.message : "Could not submit this content for review.");
        }
    };

    const handleSaveClassIds = async (classIds: string[]) => {
        if (!firebaseUser?.uid || !classModal) return;
        try {
            if (classIds.length === 0) {
                // No classes selected: unpublish + clear.
                await setContentClassIds(collectionName, firebaseUser.uid, classModal.id, []);
                await unpublishTeacherContent(collectionName, firebaseUser.uid, classModal.id);
            } else {
                await publishTeacherContent(collectionName, firebaseUser.uid, classModal.id, {
                    classIds,
                });
            }
            setClassModal(null);
            loadItems();
        } catch (err) {
            setActionError(err instanceof Error ? err.message : "Could not update classes.");
        }
    };

    const filtered = items.filter((item) => {
        if (search && !(item.title || "").toLowerCase().includes(search.toLowerCase())) return false;
        if (filter === "all") return true;
        if (filter === "draft" || filter === "published") {
            return (item.status || "draft") === filter;
        }
        return (item.reviewStatus || "draft") === filter;
    });

    const tabs = [
        { id: "quizzes" as const, label: "Quizzes" },
        { id: "tests" as const, label: "Test Series" },
        { id: "contests" as const, label: "Contests" },
        { id: "courses" as const, label: "Courses" },
    ];

    const filters = [
        { id: "all" as const, label: "All" },
        { id: "draft" as const, label: "Draft" },
        { id: "published" as const, label: "Published" },
        { id: "pending_review" as const, label: "Pending Public" },
        { id: "approved" as const, label: "Public" },
        { id: "rejected" as const, label: "Rejected" },
    ];

    const classroomStatusStyles: Record<string, string> = {
        draft: "bg-slate-100 text-slate-600 border-slate-200",
        published: "bg-blue-50 text-blue-700 border-blue-200",
        archived: "bg-gray-100 text-gray-500 border-gray-200",
    };

    const reviewStatusStyles: Record<string, string> = {
        draft: "hidden",
        pending_review: "bg-amber-50 text-amber-700 border-amber-200",
        approved: "bg-green-50 text-green-700 border-green-200",
        rejected: "bg-red-50 text-red-700 border-red-200",
    };

    const reviewStatusLabel = (rs: ReviewStatus) => {
        if (rs === "pending_review") return "Pending Public";
        if (rs === "approved") return "Public";
        if (rs === "rejected") return "Rejected";
        return "";
    };

    const renderClassChips = (ids: string[]) => {
        if (!ids || ids.length === 0) return null;
        return (
            <div className="flex flex-wrap gap-1.5 mt-2">
                {ids.map((id) => {
                    const cls = classes.find((c) => c.id === id);
                    return (
                        <span
                            key={id}
                            className="rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-semibold text-primary-700"
                        >
                            {cls?.name || id.slice(0, 6)}
                        </span>
                    );
                })}
            </div>
        );
    };

    return (
        <div className="space-y-6">
            {isInstituteAdmin && (
                <Card intent="info" className="p-4 text-sm">
                    <p className="font-semibold text-info-700">You&apos;re in the teacher workspace.</p>
                    <p className="text-info-700/80 mt-0.5">
                        Editing institute-owned content uses the same forms teachers use.
                        <Link href="/institute/content" className="ml-2 font-semibold underline">
                            Back to institute content list →
                        </Link>
                    </p>
                </Card>
            )}
            <div className="flex items-center justify-between">
                <div>
                    <div className="flex items-center gap-1.5">
                        <h1 className="text-2xl font-bold text-gray-900">My Content</h1>
                        <HelpTutorial {...TUTORIALS.teacher_content} />
                    </div>
                    <p className="mt-1 text-gray-500">
                        Publish to one or many classes. Submit for review to feature on the main website.
                    </p>
                </div>
                <Link
                    href={`/teacher/content/new/${tab === "tests" ? "test" : tab === "quizzes" ? "quiz" : tab === "contests" ? "contest" : "course"}`}
                >
                    <Button variant="primary">+ Create New</Button>
                </Link>
            </div>

            <div className="flex gap-2 border-b border-gray-200 pb-px">
                {tabs.map((t) => (
                    <button
                        key={t.id}
                        onClick={() => setTab(t.id)}
                        className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                            tab === t.id
                                ? "text-primary-700 border-b-2 border-primary-700"
                                : "text-gray-500 hover:text-gray-700"
                        }`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            <div className="flex gap-3 flex-wrap">
                <input
                    type="text"
                    placeholder="Search..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-48 outline-none focus:ring-2 focus:ring-primary-500"
                />
                <div className="flex gap-1">
                    {filters.map((f) => (
                        <button
                            key={f.id}
                            onClick={() => setFilter(f.id)}
                            className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                                filter === f.id
                                    ? "bg-primary-100 text-primary-800 font-semibold"
                                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                            }`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            {actionError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                    {actionError}
                </div>
            )}

            {classes.length === 0 && (
                <Card className="border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                    You don&apos;t have any classes yet.{" "}
                    <Link href="/teacher/classes" className="font-semibold underline">
                        Create one
                    </Link>{" "}
                    so you can publish content to students.
                </Card>
            )}

            {loading ? (
                <div className="flex items-center justify-center h-40 text-gray-500">Loading...</div>
            ) : filtered.length === 0 ? (
                <Card className="p-12 text-center text-gray-500">
                    <p className="mb-4">No {tab} found.</p>
                    <Link
                        href={`/teacher/content/new/${tab === "tests" ? "test" : tab === "quizzes" ? "quiz" : tab === "contests" ? "contest" : "course"}`}
                        className="text-primary-700 hover:text-primary-800 font-medium text-sm"
                    >
                        Create your first {tab.slice(0, -1)} →
                    </Link>
                </Card>
            ) : (
                <div className="space-y-3">
                    {filtered.map((item) => {
                        const classroomStatus: ClassroomStatus = item.status || "draft";
                        const reviewStatus: ReviewStatus = item.reviewStatus || "draft";
                        const itemClassIds: string[] = Array.isArray(item.classIds) ? item.classIds : [];
                        return (
                            <Card key={item.id} className="p-5 flex items-start justify-between flex-wrap gap-4">
                                <div className="min-w-0">
                                    <h3 className="font-semibold text-gray-900 truncate">
                                        {item.title || "Untitled"}
                                    </h3>
                                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                                        <span
                                            className={`px-2 py-0.5 rounded-full text-xs font-medium border ${classroomStatusStyles[classroomStatus]}`}
                                        >
                                            {classroomStatus === "published" ? "Live" : classroomStatus}
                                        </span>
                                        {reviewStatus !== "draft" && (
                                            <span
                                                className={`px-2 py-0.5 rounded-full text-xs font-medium border ${reviewStatusStyles[reviewStatus]}`}
                                            >
                                                {reviewStatusLabel(reviewStatus)}
                                            </span>
                                        )}
                                        <span className="text-xs text-gray-400">
                                            {new Date(item.createdAt?.toDate?.() || item.createdAt).toLocaleDateString(
                                                "en-IN"
                                            )}
                                        </span>
                                    </div>
                                    {renderClassChips(itemClassIds)}
                                </div>
                                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                                    <Link href={`/teacher/content/${tab}/${item.id}/edit`}>
                                        <Button variant="outline" size="sm">
                                            Edit
                                        </Button>
                                    </Link>
                                    {tab === "tests" && (
                                        <Link href={`/teacher/content/tests/${item.id}/tests`}>
                                            <Button variant="outline" size="sm">
                                                Manage Tests
                                            </Button>
                                        </Link>
                                    )}
                                    {tab === "quizzes" && (
                                        <Link href={`/teacher/content/quizzes/${item.id}/questions`}>
                                            <Button variant="outline" size="sm">
                                                Manage Questions
                                            </Button>
                                        </Link>
                                    )}
                                    {(tab === "tests" || tab === "quizzes") && (
                                        <Link href={`/teacher/content/${tab}/${item.id}/attempts`}>
                                            <Button variant="outline" size="sm">
                                                View Attempts
                                            </Button>
                                        </Link>
                                    )}
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setClassModal({ id: item.id, current: itemClassIds })}
                                        disabled={classes.length === 0}
                                    >
                                        Classes
                                    </Button>
                                    {classroomStatus === "draft" ? (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handlePublishClick(item)}
                                            disabled={classes.length === 0}
                                        >
                                            Publish
                                        </Button>
                                    ) : (
                                        <Button variant="outline" size="sm" onClick={() => handleUnpublish(item.id)}>
                                            Unpublish
                                        </Button>
                                    )}
                                    {reviewStatus === "draft" && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleSubmitForReview(item.id)}
                                        >
                                            Submit for Public
                                        </Button>
                                    )}
                                    {reviewStatus === "rejected" && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleSubmitForReview(item.id)}
                                        >
                                            Re-submit
                                        </Button>
                                    )}
                                    {reviewStatus === "pending_review" && (
                                        <span className="px-3 py-1.5 text-xs bg-amber-50 text-amber-700 rounded-lg border border-amber-200">
                                            Under Review
                                        </span>
                                    )}
                                    {reviewStatus === "approved" && (
                                        <span className="px-3 py-1.5 text-xs bg-green-50 text-green-700 rounded-lg border border-green-200">
                                            Public
                                        </span>
                                    )}
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleDelete(item.id)}
                                        className="text-red-600 hover:text-red-700"
                                    >
                                        Delete
                                    </Button>
                                </div>
                            </Card>
                        );
                    })}
                </div>
            )}

            {classModal && (
                <ClassPickerModal
                    classes={classes}
                    initial={classModal.current}
                    onCancel={() => setClassModal(null)}
                    onSave={handleSaveClassIds}
                />
            )}
        </div>
    );
}

function ClassPickerModal({
    classes,
    initial,
    onCancel,
    onSave,
}: {
    classes: ClassRow[];
    initial: string[];
    onCancel: () => void;
    onSave: (ids: string[]) => void;
}) {
    const [selected, setSelected] = useState<Set<string>>(new Set(initial));
    const [saving, setSaving] = useState(false);

    const toggle = (id: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await onSave(Array.from(selected));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
            onClick={() => !saving && onCancel()}
        >
            <Card className="w-full max-w-md mx-4 p-6" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">Publish to classes</h3>
                <p className="text-gray-500 text-sm mb-4">
                    Students enrolled in the selected classes will see this content. Deselect all to unpublish.
                </p>
                <div className="space-y-2 max-h-64 overflow-y-auto mb-4">
                    {classes.length === 0 ? (
                        <p className="text-sm text-gray-500">
                            No classes yet.{" "}
                            <Link href="/teacher/classes" className="text-primary-700 underline">
                                Create one
                            </Link>
                            .
                        </p>
                    ) : (
                        classes.map((c) => (
                            <label
                                key={c.id}
                                className="flex items-center gap-3 cursor-pointer rounded-lg border border-gray-200 px-3 py-2 hover:bg-gray-50"
                            >
                                <input
                                    type="checkbox"
                                    checked={selected.has(c.id)}
                                    onChange={() => toggle(c.id)}
                                    className="h-4 w-4"
                                />
                                <span className="flex-1">
                                    <span className="block text-sm font-medium text-gray-900">{c.name}</span>
                                    <span className="block text-[10px] font-mono text-gray-400">{c.inviteCode}</span>
                                </span>
                            </label>
                        ))
                    )}
                </div>
                <div className="flex gap-2">
                    <Button variant="primary" className="flex-1" onClick={handleSave} isLoading={saving}>
                        Save
                    </Button>
                    <Button variant="outline" onClick={onCancel} disabled={saving}>
                        Cancel
                    </Button>
                </div>
            </Card>
        </div>
    );
}
