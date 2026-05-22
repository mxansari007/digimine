"use client";

/**
 * Teacher "Edit Quiz" page. Same shared `QuizForm` as the create page, but
 * pre-filled with the existing quiz and routed through `updateTeacherQuiz`.
 *
 * Ownership and review-lock checks live in `updateTeacherQuiz` itself, so the
 * page just needs to load the doc and surface any thrown error inline.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Button, Card } from "@digimine/ui";
import { QuizForm } from "@digimine/shared";
import { storage } from "@/lib/firebase/client";
import { useAuthContext } from "@/contexts/AuthContext";
import {
    getOwnedTeacherQuiz,
    updateTeacherQuiz,
} from "@/lib/firestore/teacherContent";
import type { CreateQuizInput, Quiz } from "@digimine/types";

export default function EditTeacherQuizPage() {
    const params = useParams();
    const router = useRouter();
    const quizId = params.id as string;
    const { firebaseUser } = useAuthContext();

    const [quiz, setQuiz] = useState<Quiz | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!firebaseUser?.uid) return;
        let mounted = true;
        getOwnedTeacherQuiz(firebaseUser.uid, quizId)
            .then((data) => {
                if (!mounted) return;
                if (!data) {
                    setError("Quiz not found or you don't have access.");
                    return;
                }
                setQuiz(data);
            })
            .catch((err) => {
                if (!mounted) return;
                setError(err instanceof Error ? err.message : "Failed to load quiz.");
            })
            .finally(() => mounted && setLoading(false));
        return () => {
            mounted = false;
        };
    }, [firebaseUser?.uid, quizId]);

    const handleSubmit = async (payload: CreateQuizInput) => {
        if (!firebaseUser?.uid) {
            throw new Error("You must be signed in as a teacher to edit a quiz.");
        }
        await updateTeacherQuiz(firebaseUser.uid, quizId, payload);
        router.push("/teacher/content");
        router.refresh();
    };

    if (loading) {
        return (
            <Card className="p-8 text-center text-slate-500">Loading quiz...</Card>
        );
    }

    if (error || !quiz) {
        return (
            <div className="space-y-4">
                <Link href="/teacher/content">
                    <Button variant="outline" size="sm">← Back</Button>
                </Link>
                <Card className="p-8 text-center text-red-600">
                    {error || "Quiz not found."}
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
                    <h1 className="text-2xl font-bold text-slate-950">Edit Quiz</h1>
                    <p className="mt-1 text-slate-500">{quiz.title}</p>
                </div>
            </div>

            <QuizForm
                initialData={quiz}
                onSubmit={handleSubmit}
                onCancel={() => router.push("/teacher/content")}
                storage={storage}
                mode="teacher"
            />
        </div>
    );
}
