"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@digimine/ui";
import { CourseForm } from "@digimine/shared";
import { storage } from "@/lib/firebase/client";
import { useAuthContext } from "@/contexts/AuthContext";
import { createTeacherCourse, getTeacherQuizzes, getTeacherTests } from "@/lib/firestore/teacherContent";
import { MobileAuthoringNotice } from "@/components/teacher/MobileAuthoringNotice";
import type { Quiz, TestSeries } from "@digimine/types";

export default function CreateTeacherCoursePage() {
    const router = useRouter();
    const { firebaseUser } = useAuthContext();

    const handleSubmit = async (
        payload: Record<string, unknown>,
        onSuccess: () => void,
    ) => {
        if (!firebaseUser?.uid) {
            throw new Error("You must be signed in as a teacher to create a course.");
        }
        // Land on the course edit page so the teacher can keep refining
        // chapters / linked quizzes / linked tests instead of being dumped
        // back on /teacher/content.
        const courseId = await createTeacherCourse(firebaseUser.uid, payload as any);
        onSuccess();
        router.push(`/teacher/content/courses/${courseId}/edit`);
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

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Link href="/teacher/content">
                    <Button variant="outline" size="sm">← Back</Button>
                </Link>
                <div>
                    <h1 className="text-2xl font-bold text-slate-950">Create Course</h1>
                    <p className="mt-1 text-slate-500">
                        Build a course with chapters and notes. Saved as private until you submit it for review.
                    </p>
                </div>
            </div>

            <MobileAuthoringNotice what="Building a course" />

            <CourseForm
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
