"use client";

/**
 * Admin shim for the shared CourseForm.
 * Wires up admin-specific dependencies (auth, storage, Firestore, CourseNotesEditor).
 */
import { CourseForm as SharedCourseForm } from "@digimine/shared";
import type { Course, Quiz, TestSeries } from "@digimine/types";
import { storage } from "@/lib/firebase/client";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { createCourse, updateCourse } from "@/lib/firestore/courses";
import { getAllTests } from "@/lib/firestore/tests";
import { getAllQuizzes } from "@/lib/firestore/quizzes";
import { CourseNotesEditor } from "@/components/common/CourseNotesEditor";
import { isPlatformOwned } from "@/lib/firestore/ownership";

interface AdminCourseFormProps {
    initialData?: Course;
}

export function CourseForm({ initialData }: AdminCourseFormProps) {
    const { user } = useAdminAuth();

    const handleSubmit = async (
        payload: Record<string, unknown>,
        onSuccess: () => void,
    ) => {
        if (!user) throw new Error("Admin not authenticated");
        if (initialData) {
            await updateCourse({ id: initialData.id, ...payload } as any);
        } else {
            await createCourse(payload as any, user.id);
        }
        onSuccess();
    };

    // Only show content the admin can legitimately attach to a public course:
    // platform-authored (no teacherId) or teacher-authored AND already approved
    // into the public catalog (visibility === "published"). Teacher-private
    // content lives in /teacher-submissions and requires approval first.
    const loadTestSeries = async (): Promise<TestSeries[]> => {
        const all = await getAllTests();
        return all.filter((t) => isPlatformOwned(t as unknown as { teacherId?: string; visibility?: string }));
    };
    const loadQuizzes = async (): Promise<Quiz[]> => {
        const all = await getAllQuizzes();
        return all.filter((q) => isPlatformOwned(q as unknown as { teacherId?: string; visibility?: string }));
    };

    return (
        <SharedCourseForm
            initialData={initialData}
            actingUserId={user?.id || ""}
            storage={storage}
            onSubmit={handleSubmit}
            loadTestSeries={loadTestSeries}
            loadQuizzes={loadQuizzes}
            CourseNotesEditor={CourseNotesEditor as any}
        />
    );
}
