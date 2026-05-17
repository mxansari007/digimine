"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@digimine/ui";
import { CourseForm } from "@/components/courses/CourseForm";
import { getCourse } from "@/lib/firestore/courses";
import type { Course } from "@digimine/types";

export default function EditCoursePage() {
    const params = useParams();
    const router = useRouter();
    const courseId = params.id as string;
    const [course, setCourse] = useState<Course | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function loadCourse() {
            try {
                const data = await getCourse(courseId);
                if (!data) {
                    router.push("/courses");
                    return;
                }
                setCourse(data);
            } catch (error) {
                console.error("Error loading course:", error);
                router.push("/courses");
            } finally {
                setLoading(false);
            }
        }

        loadCourse();
    }, [courseId, router]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-24">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
            </div>
        );
    }

    if (!course) return null;

    return (
        <div className="space-y-6">
            <div>
                <Link href="/courses">
                    <Button variant="outline" size="sm" className="mb-3">
                        Back to Courses
                    </Button>
                </Link>
                <h1 className="text-2xl font-bold text-gray-900">Edit Course</h1>
                <p className="mt-1 text-gray-500">Update notes, access, quizzes, and linked test series.</p>
            </div>
            <CourseForm initialData={course} />
        </div>
    );
}
