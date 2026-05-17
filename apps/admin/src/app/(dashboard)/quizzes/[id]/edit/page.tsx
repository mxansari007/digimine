"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "@digimine/ui";
import { QuizForm } from "@/components/quizzes/QuizForm";
import { getQuiz } from "@/lib/firestore/quizzes";
import type { Quiz } from "@digimine/types";

export default function EditQuizPage() {
    const params = useParams();
    const quizId = params.id as string;
    const [quiz, setQuiz] = useState<Quiz | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        getQuiz(quizId)
            .then(setQuiz)
            .catch((error) => console.error("Failed to load quiz:", error))
            .finally(() => setLoading(false));
    }, [quizId]);

    if (loading) {
        return <div className="py-12 text-center text-slate-500">Loading quiz...</div>;
    }

    if (!quiz) {
        return (
            <div className="py-12 text-center">
                <h1 className="text-2xl font-bold text-slate-950">Quiz not found</h1>
                <Link href="/quizzes">
                    <Button className="mt-4">Back to Quizzes</Button>
                </Link>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Link href="/quizzes">
                    <Button variant="outline" size="sm">← Back</Button>
                </Link>
                <div>
                    <h1 className="text-2xl font-bold text-slate-950">Edit Quiz</h1>
                    <p className="mt-1 text-slate-500">{quiz.title}</p>
                </div>
            </div>
            <QuizForm initialData={quiz} />
        </div>
    );
}
