"use client";

/**
 * Admin shim for the shared ContestForm.
 * Wires up admin-specific dependencies (auth, storage, Firestore,
 * QuestionBankPicker, markdown parser).
 */
import { ContestForm as SharedContestForm } from "@digimine/shared";
import type {
  Contest,
  CreateQuizQuestionInput,
  Quiz,
  Test,
  TestSeries,
} from "@digimine/types";
import { storage } from "@/lib/firebase/client";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { createContest, updateContest } from "@/lib/firestore/contests";
import { getAllTestSeries, getTestsInSeries } from "@/lib/firestore/tests";
import { getAllQuizzes } from "@/lib/firestore/quizzes";
import { incrementQuestionBankUsage } from "@/lib/firestore/questionBank";
import {
  parseQuizQuestionsMarkdown,
  QUIZ_QUESTION_TEMPLATE_MD,
} from "@/lib/import/quizMarkdownQuestions";
import { QuestionBankPicker } from "@/components/question-bank/QuestionBankPicker";

interface AdminContestFormProps {
  contest?: Contest;
}

export function ContestForm({ contest }: AdminContestFormProps) {
  const { user } = useAdminAuth();

  const handleSubmit = async (
    payload: Record<string, unknown>,
    onSuccess: () => void
  ) => {
    if (!user) throw new Error("Admin not authenticated");
    if (contest) {
      await updateContest({ id: contest.id, ...payload } as any);
    } else {
      await createContest(payload as any, user.id);
    }
    onSuccess();
  };

  const loadTestSeries = async (): Promise<TestSeries[]> => getAllTestSeries();
  const loadTestsInSeries = async (seriesId: string): Promise<Test[]> =>
    getTestsInSeries(seriesId);
  const loadQuizzes = async (): Promise<Quiz[]> => getAllQuizzes();

  const parseMarkdown = (
    md: string
  ): {
    questions: CreateQuizQuestionInput[];
    errors: { line: number; message: string }[];
  } => parseQuizQuestionsMarkdown(md);

  const onBankQuestionsUsed = async (questionIds: string[]): Promise<void> => {
    await incrementQuestionBankUsage(questionIds);
  };

  return (
    <SharedContestForm
      contest={contest}
      actingUserId={user?.id || ""}
      storage={storage}
      onSubmit={handleSubmit}
      loadTestSeries={loadTestSeries}
      loadTestsInSeries={loadTestsInSeries}
      loadQuizzes={loadQuizzes}
      QuestionBankPicker={QuestionBankPicker as any}
      parseMarkdown={parseMarkdown}
      markdownTemplate={QUIZ_QUESTION_TEMPLATE_MD}
      onBankQuestionsUsed={onBankQuestionsUsed}
    />
  );
}
