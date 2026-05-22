"use client";

/**
 * Teacher "Edit Contest" page. Loads the contest, then reuses the same shared
 * `ContestForm` (with question-bank picker / markdown importer) that the create
 * page uses. Saving routes through `updateTeacherContest` which enforces
 * ownership and review-lock.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Button, Card } from "@digimine/ui";
import { ContestForm } from "@digimine/shared";
import { storage } from "@/lib/firebase/client";
import { useAuthContext } from "@/contexts/AuthContext";
import {
    getTeacherContest,
    getTeacherQuizzes,
    getTeacherTests,
    updateTeacherContest,
} from "@/lib/firestore/teacherContent";
import { getTeacherTestsInSeries } from "@/lib/firestore/tests";
import { QuestionBankPicker as TeacherQuestionBankPicker } from "@/components/question-bank/QuestionBankPicker";
import { incrementTeacherQuestionBankUsage } from "@/lib/firestore/questionBank";
import {
    parseQuizQuestionsMarkdown,
    QUIZ_QUESTION_TEMPLATE_MD,
} from "@/lib/import/quizMarkdownQuestions";
import type {
    Contest,
    CreateQuizQuestionInput,
    QuestionBankQuestion,
    Quiz,
    Test,
    TestSeries,
} from "@digimine/types";

export default function EditTeacherContestPage() {
    const params = useParams();
    const router = useRouter();
    const contestId = params.id as string;
    const { firebaseUser } = useAuthContext();

    const [contest, setContest] = useState<Contest | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!firebaseUser?.uid) return;
        let mounted = true;
        getTeacherContest(firebaseUser.uid, contestId)
            .then((data) => {
                if (!mounted) return;
                if (!data) {
                    setError("Contest not found or you don't have access.");
                    return;
                }
                setContest(data);
            })
            .catch((err) => {
                if (!mounted) return;
                setError(err instanceof Error ? err.message : "Failed to load contest.");
            })
            .finally(() => mounted && setLoading(false));
        return () => {
            mounted = false;
        };
    }, [firebaseUser?.uid, contestId]);

    const handleSubmit = async (
        payload: Record<string, unknown>,
        onSuccess: () => void
    ) => {
        if (!firebaseUser?.uid) {
            throw new Error("You must be signed in as a teacher to edit a contest.");
        }
        await updateTeacherContest(
            firebaseUser.uid,
            contestId,
            payload as Partial<Contest>
        );
        onSuccess();
        router.push("/teacher/content");
        router.refresh();
    };

    const loadTestSeries = async (): Promise<TestSeries[]> => {
        if (!firebaseUser?.uid) return [];
        return getTeacherTests(firebaseUser.uid);
    };

    const loadTestsInSeriesFn = async (seriesId: string): Promise<Test[]> =>
        getTeacherTestsInSeries(seriesId);

    const loadQuizzes = async (): Promise<Quiz[]> => {
        if (!firebaseUser?.uid) return [];
        return getTeacherQuizzes(firebaseUser.uid);
    };

    const parseMarkdown = (
        md: string
    ): {
        questions: CreateQuizQuestionInput[];
        errors: { line: number; message: string }[];
    } => parseQuizQuestionsMarkdown(md);

    const onBankQuestionsUsed = async (questionIds: string[]): Promise<void> => {
        if (!firebaseUser?.uid) return;
        await incrementTeacherQuestionBankUsage(firebaseUser.uid, questionIds);
    };

    const QuestionBankPicker = (props: {
        open: boolean;
        mode: "quiz";
        onClose: () => void;
        onSelect: (questions: QuestionBankQuestion[]) => void;
        title: string;
    }) => (
        <TeacherQuestionBankPicker {...props} teacherId={firebaseUser?.uid || ""} />
    );

    if (loading) {
        return (
            <Card className="p-8 text-center text-slate-500">Loading contest...</Card>
        );
    }

    if (error || !contest) {
        return (
            <div className="space-y-4">
                <Link href="/teacher/content">
                    <Button variant="outline" size="sm">← Back</Button>
                </Link>
                <Card className="p-8 text-center text-red-600">
                    {error || "Contest not found."}
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
                    <h1 className="text-2xl font-bold text-slate-950">Edit Contest</h1>
                    <p className="mt-1 text-slate-500">{contest.title}</p>
                </div>
            </div>

            <ContestForm
                contest={contest}
                actingUserId={firebaseUser?.uid || ""}
                storage={storage}
                onSubmit={handleSubmit}
                loadTestSeries={loadTestSeries}
                loadTestsInSeries={loadTestsInSeriesFn}
                loadQuizzes={loadQuizzes}
                QuestionBankPicker={QuestionBankPicker}
                parseMarkdown={parseMarkdown}
                markdownTemplate={QUIZ_QUESTION_TEMPLATE_MD}
                onBankQuestionsUsed={onBankQuestionsUsed}
                mode="teacher"
            />
        </div>
    );
}
