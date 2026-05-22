"use client";

/**
 * Teacher "Edit Course" page. Reuses the shared `CourseForm` with the existing
 * course as `initialData`, and persists via `updateTeacherCourse`.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Button, Card } from "@digimine/ui";
import { CourseForm } from "@digimine/shared";
import { storage } from "@/lib/firebase/client";
import { useAuthContext } from "@/contexts/AuthContext";
import {
    getTeacherCourse,
    getTeacherQuizzes,
    getTeacherTests,
    updateTeacherCourse,
} from "@/lib/firestore/teacherContent";
import type { Course, Quiz, TestSeries } from "@digimine/types";

export default function EditTeacherCoursePage() {
    const params = useParams();
    const router = useRouter();
    const courseId = params.id as string;
    const { firebaseUser } = useAuthContext();

    const [course, setCourse] = useState<Course | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!firebaseUser?.uid) return;
        let mounted = true;
        getTeacherCourse(firebaseUser.uid, courseId)
            .then((data) => {
                if (!mounted) return;
                if (!data) {
                    setError("Course not found or you don't have access.");
                    return;
                }
                setCourse(data);
            })
            .catch((err) => {
                if (!mounted) return;
                setError(err instanceof Error ? err.message : "Failed to load course.");
            })
            .finally(() => mounted && setLoading(false));
        return () => {
            mounted = false;
        };
    }, [firebaseUser?.uid, courseId]);

    const handleSubmit = async (
        payload: Record<string, unknown>,
        onSuccess: () => void
    ) => {
        if (!firebaseUser?.uid) {
            throw new Error("You must be signed in as a teacher to edit a course.");
        }
        await updateTeacherCourse(firebaseUser.uid, courseId, payload as Partial<Course>);
        onSuccess();
        router.push("/teacher/content");
        router.refresh();
    };

    const loadTestSeries = async (): Promise<TestSeries[]> => {
        if (!firebaseUser?.uid) return [];
        return getTeacherTests(firebaseUser.uid);
    };

    const loadQuizzes = async (): Promise<Quiz[]> => {
        if (!firebaseUser?.uid) return [];
        return getTeacherQuizzes(firebaseUser.uid);
    };

    if (loading) {
        return (
            <Card className="p-8 text-center text-slate-500">Loading course...</Card>
        );
    }

    if (error || !course) {
        return (
            <div className="space-y-4">
                <Link href="/teacher/content">
                    <Button variant="outline" size="sm">← Back</Button>
                </Link>
                <Card className="p-8 text-center text-red-600">
                    {error || "Course not found."}
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Link href="/teacher/content">
                    <Button variant="outline" size="sm">← Back</Button>
                </Link>
                <div>
                    <h1 className="text-2xl font-bold text-slate-950">Edit Course</h1>
                    <p className="mt-1 text-slate-500">{course.title}</p>
                </div>
            </div>

            <CourseForm
                initialData={course}
                actingUserId={firebaseUser?.uid || ""}
                storage={storage}
                onSubmit={handleSubmit}
                loadTestSeries={loadTestSeries}
                loadQuizzes={loadQuizzes}
                mode="teacher"
            />
        </div>
    );
}
