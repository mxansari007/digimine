import Link from "next/link";
import { Button } from "@digimine/ui";
import { QuizForm } from "@/components/quizzes/QuizForm";

export default function CreateQuizPage() {
    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Link href="/quizzes">
                    <Button variant="outline" size="sm">← Back</Button>
                </Link>
                <div>
                    <h1 className="text-2xl font-bold text-slate-950">Create Quiz</h1>
                    <p className="mt-1 text-slate-500">Build a short practice quiz with rich questions and explanations.</p>
                </div>
            </div>
            <QuizForm />
        </div>
    );
}
