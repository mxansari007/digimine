"use client";

/**
 * Teacher "Create Quiz" page. Thin wrapper around the shared
 * `QuizForm` from `@digimine/shared` — the same builder admin uses —
 * with teacher-mode UI and a teacher-aware Firestore writer.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@digimine/ui";
import { QuizForm } from "@digimine/shared";
import { storage } from "@/lib/firebase/client";
import { useAuthContext } from "@/contexts/AuthContext";
import { createTeacherQuiz } from "@/lib/firestore/teacherContent";
import { MobileAuthoringNotice } from "@/components/teacher/MobileAuthoringNotice";

export default function CreateTeacherQuizPage() {
    const router = useRouter();
    const { firebaseUser } = useAuthContext();

    const handleSubmit = async (payload: Parameters<typeof createTeacherQuiz>[1]) => {
        if (!firebaseUser?.uid) {
            throw new Error("You must be signed in as a teacher to create a quiz.");
        }
        // Continue the authoring flow into the questions editor for this
        // quiz instead of dumping the teacher back on /teacher/content.
        const quizId = await createTeacherQuiz(firebaseUser.uid, payload);
        router.push(`/teacher/content/quizzes/${quizId}/questions`);
        router.refresh();
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Link href="/teacher/content">
                    <Button variant="outline" size="sm">← Back</Button>
                </Link>
                <div>
                    <h1 className="text-2xl font-bold text-slate-950">Create Quiz</h1>
                    <p className="mt-1 text-slate-500">
                        Build a practice quiz for your classroom. Saved as private until you submit it for review.
                    </p>
                </div>
            </div>

            <MobileAuthoringNotice what="Building a quiz" />

            <QuizForm
                onSubmit={handleSubmit}
                onCancel={() => router.push("/teacher/content")}
                storage={storage}
                mode="teacher"
            />
        </div>
    );
}
