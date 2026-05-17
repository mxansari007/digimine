"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
    Button,
    Card,
    DataTable,
    PaginationControls,
    getPaginatedItems,
    type DataTableColumn,
} from "@digimine/ui";
import { deleteCourse, getAllCourses } from "@/lib/firestore/courses";
import type { Course, CourseStatus } from "@digimine/types";

type SortOption = "newest" | "oldest" | "title" | "chapters";

export default function CoursesPage() {
    const [courses, setCourses] = useState<Course[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState<CourseStatus | "all">("all");
    const [sortBy, setSortBy] = useState<SortOption>("newest");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    useEffect(() => {
        fetchCourses();
    }, []);

    useEffect(() => {
        setPage(1);
    }, [searchQuery, statusFilter, sortBy]);

    async function fetchCourses() {
        try {
            setLoading(true);
            const data = await getAllCourses();
            setCourses(data);
        } catch (error) {
            console.error("Error fetching courses:", error);
        } finally {
            setLoading(false);
        }
    }

    async function handleDelete(course: Course) {
        if (!confirm(`Delete "${course.title}" and all its notes?`)) return;
        setDeletingId(course.id);
        try {
            await deleteCourse(course.id);
            setCourses((prev) => prev.filter((item) => item.id !== course.id));
        } catch (error) {
            console.error("Error deleting course:", error);
            alert("Failed to delete course. Please try again.");
        } finally {
            setDeletingId(null);
        }
    }

    const filteredCourses = useMemo(() => {
        const q = searchQuery.toLowerCase();
        let list = courses.filter((course) => {
            const matchesStatus = statusFilter === "all" || course.status === statusFilter;
            const matchesSearch =
                course.title.toLowerCase().includes(q) ||
                (course.shortDescription || "").toLowerCase().includes(q) ||
                (course.category || "").toLowerCase().includes(q);
            return matchesStatus && matchesSearch;
        });

        switch (sortBy) {
            case "oldest":
                list = [...list].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
                break;
            case "title":
                list = [...list].sort((a, b) => a.title.localeCompare(b.title));
                break;
            case "chapters":
                list = [...list].sort((a, b) => (b.notesSummary?.chapterCount || 0) - (a.notesSummary?.chapterCount || 0));
                break;
            case "newest":
            default:
                list = [...list].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        }

        return list;
    }, [courses, searchQuery, sortBy, statusFilter]);

    const counts = {
        total: courses.length,
        published: courses.filter((course) => course.status === "published").length,
        gated: courses.filter((course) => course.accessType === "enrollment_required").length,
        chapters: courses.reduce((total, course) => total + (course.notesSummary?.chapterCount || 0), 0),
    };

    const paginatedCourses = getPaginatedItems(filteredCourses, page, pageSize);

    const columns: DataTableColumn<Course>[] = [
        {
            key: "course",
            header: "Course",
            render: (course) => (
                <div className="min-w-0">
                    <p className="font-bold text-gray-900">{course.title}</p>
                    <p className="mt-1 line-clamp-1 text-sm text-gray-500">{course.shortDescription || course.description}</p>
                </div>
            ),
        },
        {
            key: "access",
            header: "Access",
            render: (course) => (
                <div className="space-y-1">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${course.accessType === "free" ? "bg-green-100 text-green-700" : "bg-indigo-100 text-indigo-700"}`}>
                        {course.accessType === "free" ? "Free" : "Paid"}
                    </span>
                    {course.accessType === "enrollment_required" && (
                        <p className="text-xs font-semibold text-gray-500">₹{course.price || 0}</p>
                    )}
                </div>
            ),
        },
        {
            key: "status",
            header: "Status",
            render: (course) => (
                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${course.status === "published" ? "bg-green-100 text-green-700" : course.status === "draft" ? "bg-gray-100 text-gray-700" : "bg-amber-100 text-amber-700"}`}>
                    {course.status}
                </span>
            ),
        },
        {
            key: "content",
            header: "Content",
            render: (course) => (
                <div className="text-sm text-gray-600">
                    <p>{course.notesSummary?.chapterCount || 0} chapters</p>
                    <p className="text-xs text-gray-400">{course.notesSummary?.subtopicCount || 0} subtopics</p>
                </div>
            ),
        },
        {
            key: "actions",
            header: "Actions",
            className: "text-right",
            render: (course) => (
                <div className="flex justify-end gap-2">
                    <Link href={`/courses/${course.id}/edit`}>
                        <Button variant="outline" size="sm">Edit</Button>
                    </Link>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={deletingId === course.id}
                        onClick={() => handleDelete(course)}
                        className="border-red-200 text-red-600 hover:bg-red-50"
                    >
                        {deletingId === course.id ? "Deleting..." : "Delete"}
                    </Button>
                </div>
            ),
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Courses & Notes</h1>
                    <p className="mt-1 text-gray-500">Manage study material, chapters, videos, quizzes, and linked tests.</p>
                </div>
                <Link href="/courses/create">
                    <Button className="bg-indigo-600 text-white hover:bg-indigo-700">
                        <span className="mr-2">+</span>
                        Create Course
                    </Button>
                </Link>
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
                {[
                    ["Total", counts.total],
                    ["Published", counts.published],
                    ["Enrollment", counts.gated],
                    ["Chapters", counts.chapters],
                ].map(([label, value]) => (
                    <Card key={label} className="p-4">
                        <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{label}</p>
                        <p className="mt-1 text-2xl font-black text-gray-900">{value}</p>
                    </Card>
                ))}
            </div>

            <Card className="p-4">
                <div className="grid gap-3 lg:grid-cols-[1fr_180px_180px]">
                    <input
                        type="search"
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        placeholder="Search courses, topics, or category..."
                        className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                    />
                    <select
                        value={statusFilter}
                        onChange={(event) => setStatusFilter(event.target.value as CourseStatus | "all")}
                        className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none"
                    >
                        <option value="all">All status</option>
                        <option value="published">Published</option>
                        <option value="draft">Draft</option>
                        <option value="archived">Archived</option>
                    </select>
                    <select
                        value={sortBy}
                        onChange={(event) => setSortBy(event.target.value as SortOption)}
                        className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none"
                    >
                        <option value="newest">Newest first</option>
                        <option value="oldest">Oldest first</option>
                        <option value="title">Title</option>
                        <option value="chapters">Most chapters</option>
                    </select>
                </div>
            </Card>

            <DataTable
                data={paginatedCourses}
                columns={columns}
                isLoading={loading}
                keyExtractor={(course) => course.id}
                emptyState="No courses found. Create your first study course to start adding notes."
                footer={
                    <PaginationControls
                        page={page}
                        pageSize={pageSize}
                        totalItems={filteredCourses.length}
                        itemLabel="courses"
                        onPageChange={setPage}
                        onPageSizeChange={(nextPageSize) => {
                            setPageSize(nextPageSize);
                            setPage(1);
                        }}
                    />
                }
            />
        </div>
    );
}
