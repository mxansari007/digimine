"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@digimine/ui";
import { ContestForm } from "@digimine/shared";
import { storage } from "@/lib/firebase/client";
import { useAuthContext } from "@/contexts/AuthContext";
import {
  createTeacherContest,
  getTeacherQuizzes,
  getTeacherTests,
} from "@/lib/firestore/teacherContent";
import { getTeacherTestsInSeries } from "@/lib/firestore/tests";
import { QuestionBankPicker as TeacherQuestionBankPicker } from "@/components/question-bank/QuestionBankPicker";
import { incrementTeacherQuestionBankUsage } from "@/lib/firestore/questionBank";
import {
  parseQuizQuestionsMarkdown,
  QUIZ_QUESTION_TEMPLATE_MD,
} from "@/lib/import/quizMarkdownQuestions";
import type {
  CreateQuizQuestionInput,
  QuestionBankQuestion,
  Quiz,
  Test,
  TestSeries,
} from "@digimine/types";

export default function CreateTeacherContestPage() {
  const router = useRouter();
  const { firebaseUser } = useAuthContext();

  const handleSubmit = async (
    payload: Record<string, unknown>,
    onSuccess: () => void
  ) => {
    if (!firebaseUser?.uid) {
      throw new Error(
        "You must be signed in as a teacher to create a contest."
      );
    }
    await createTeacherContest(firebaseUser.uid, payload as any);
    onSuccess();
    router.push("/teacher/content");
    router.refresh();
  };

  const loadTestSeries = async (): Promise<TestSeries[]> => {
    if (!firebaseUser?.uid) return [];
    return getTeacherTests(firebaseUser.uid);
  };

  const loadTestsInSeriesFn = async (seriesId: string): Promise<Test[]> => {
    return getTeacherTestsInSeries(seriesId);
  };

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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/teacher/content">
          <Button variant="outline" size="sm">
            ← Back
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-950">Create Contest</h1>
          <p className="mt-1 text-slate-500">
            Set up a timed contest for your students. Pick a test or quiz as the
            source, then schedule the live window.
          </p>
        </div>
      </div>

      <ContestForm
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
