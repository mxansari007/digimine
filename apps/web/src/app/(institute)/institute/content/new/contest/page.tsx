"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Card } from "@digimine/ui";
import { ContestForm } from "@digimine/shared";
import { storage } from "@/lib/firebase/client";
import { useAuthContext } from "@/contexts/AuthContext";
import {
    createTeacherContest,
    getTeacherQuizzes,
    getTeacherTests,
} from "@/lib/firestore/teacherContent";
import { getTeacherTestsInSeries } from "@/lib/firestore/tests";
import { teacherFetch } from "@/lib/api/teacherFetch";
import { ClassPicker } from "@/components/institute/ClassPicker";
import {
    parseQuizQuestionsMarkdown,
    QUIZ_QUESTION_TEMPLATE_MD,
} from "@/lib/import/quizMarkdownQuestions";
import type { CreateQuizQuestionInput, Quiz, Test, TestSeries } from "@digimine/types";

export default function InstituteCreateContestPage() {
    const router = useRouter();
    const { firebaseUser } = useAuthContext();
    const [instituteId, setInstituteId] = useState("");
    const [classIds, setClassIds] = useState<string[]>([]);

    useEffect(() => {
        if (!firebaseUser) return;
        (async () => {
            const res = await teacherFetch(firebaseUser, "/api/institute/me");
            const data = await res.json();
            if (data?.institute?.id) setInstituteId(data.institute.id);
        })();
    }, [firebaseUser]);

    const handleSubmit = async (
        payload: Record<string, unknown>,
        onSuccess: () => void
    ) => {
        if (!firebaseUser?.uid) throw new Error("Sign in");
        if (!instituteId) throw new Error("Institute not loaded");
        await createTeacherContest(firebaseUser.uid, payload as any, {
            instituteId,
            classIds,
        });
        onSuccess();
        router.push("/institute/content");
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
    ): { questions: CreateQuizQuestionInput[]; errors: { line: number; message: string }[] } =>
        parseQuizQuestionsMarkdown(md);

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Link href="/institute/content">
                    <Button variant="outline" size="sm">
                        ← Back
                    </Button>
                </Link>
                <div>
                    <h1 className="text-2xl font-bold text-slate-950">Create contest</h1>
                    <p className="mt-1 text-slate-500">
                        Schedule a timed contest based on an existing test or quiz, pushed to selected classes.
                    </p>
                </div>
            </div>

            <Card className="p-6">
                <h3 className="text-sm font-semibold text-slate-900">Target classes</h3>
                {instituteId && (
                    <div className="mt-4">
                        <ClassPicker
                            firebaseUser={firebaseUser}
                            instituteId={instituteId}
                            selected={classIds}
                            onChange={setClassIds}
                        />
                    </div>
                )}
            </Card>

            <ContestForm
                actingUserId={firebaseUser?.uid || ""}
                storage={storage}
                onSubmit={handleSubmit}
                loadTestSeries={loadTestSeries}
                loadTestsInSeries={loadTestsInSeriesFn}
                loadQuizzes={loadQuizzes}
                parseMarkdown={parseMarkdown}
                markdownTemplate={QUIZ_QUESTION_TEMPLATE_MD}
                mode="teacher"
            />
        </div>
    );
}
