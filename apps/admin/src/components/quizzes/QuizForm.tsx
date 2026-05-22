"use client";

/**
 * Admin shim around the shared QuizForm. The shared component is purely
 * presentational; this wrapper supplies admin-specific Firestore writes
 * and routing so admin pages can keep importing
 * `@/components/quizzes/QuizForm` unchanged.
 */
import { useRouter } from "next/navigation";
import { QuizForm as SharedQuizForm } from "@digimine/shared";
import { storage } from "@/lib/firebase/client";
import { createQuiz, updateQuiz } from "@/lib/firestore/quizzes";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import type { CreateQuizInput, Quiz } from "@digimine/types";

interface QuizFormProps {
    initialData?: Quiz;
}

export function QuizForm({ initialData }: QuizFormProps) {
    const router = useRouter();
    const { user } = useAdminAuth();

    const handleSubmit = async (payload: CreateQuizInput, existingId?: string) => {
        if (existingId) {
            await updateQuiz({ id: existingId, ...payload });
        } else {
            if (!user?.id) throw new Error("You must be logged in to create a quiz.");
            await createQuiz(payload, user.id);
        }
        router.push("/quizzes");
        router.refresh();
    };

    return (
        <SharedQuizForm
            initialData={initialData}
            onSubmit={handleSubmit}
            onCancel={() => router.push("/quizzes")}
            storage={storage}
            mode="admin"
        />
    );
}
