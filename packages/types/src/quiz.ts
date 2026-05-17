import type { DifficultyLevel, MCQOption, QuestionType } from "./test";

export type QuizStatus = "draft" | "published" | "archived";

export type QuizAccessType = "free" | "course_only";

export interface Quiz {
    id: string;
    title: string;
    slug: string;
    description: string;
    shortDescription: string;
    thumbnailURL: string | null;
    status: QuizStatus;
    accessType: QuizAccessType;
    category?: string;
    tags: string[];
    timeLimitMinutes?: number;
    passingPercentage?: number;
    totalQuestions: number;
    totalMarks: number;
    shuffleQuestions: boolean;
    shuffleOptions: boolean;
    showExplanations: boolean;
    linkedCourseIds: string[];
    createdAt: Date;
    updatedAt: Date;
    createdBy: string;
}

export interface QuizQuestion {
    id: string;
    quizId: string;
    type: Exclude<QuestionType, "code">;
    questionText: string;
    options?: MCQOption[];
    correctAnswer?: string;
    explanation?: string;
    marks: number;
    negativeMarks?: number;
    difficulty: DifficultyLevel;
    order: number;
    passageGroup?: string;
    passage?: string;
    createdAt: Date;
    updatedAt: Date;
}

export type QuizAttemptStatus = "in_progress" | "completed" | "timed_out" | "abandoned";

export interface QuizAttemptAnswer {
    questionId: string;
    answer: string;
    isCorrect?: boolean;
    marksObtained?: number;
    timeSpent?: number;
}

export interface QuizAttemptQuestionResult {
    questionId: string;
    status: "correct" | "wrong" | "skipped";
    selectedAnswer: string;
    correctOptionIds?: string[];
    correctAnswer?: string;
    explanation?: string;
    earnedMarks: number;
    questionMarks: number;
    negativeMarks: number;
}

export interface QuizAttempt {
    id: string;
    userId: string;
    quizId: string;
    contestId?: string;
    sourceType?: "quiz" | "contest";
    contestTitle?: string;
    title: string;
    attemptNumber: number;
    status: QuizAttemptStatus;
    startedAt: Date;
    completedAt?: Date;
    endTime?: Date;
    currentQuestionIndex: number;
    answers: QuizAttemptAnswer[];
    questionOrder?: string[];
    optionOrder?: Record<string, string[]>;
    totalScore: number;
    maxPossibleScore: number;
    correctAnswers: number;
    wrongAnswers: number;
    skipped: number;
    percentage: number;
    passed?: boolean | null;
    passingPercentage?: number;
    questionResults?: QuizAttemptQuestionResult[];
    totalTimeSpent: number;
    remainingTime?: number;
    createdAt: Date;
    updatedAt: Date;
}

export interface CreateQuizInput {
    title: string;
    slug: string;
    description: string;
    shortDescription: string;
    thumbnailURL?: string | null;
    status?: QuizStatus;
    accessType?: QuizAccessType;
    category?: string;
    tags?: string[];
    timeLimitMinutes?: number;
    passingPercentage?: number;
    shuffleQuestions?: boolean;
    shuffleOptions?: boolean;
    showExplanations?: boolean;
    linkedCourseIds?: string[];
}

export interface UpdateQuizInput extends Partial<CreateQuizInput> {
    id: string;
}

export interface CreateQuizQuestionInput {
    quizId: string;
    type: Exclude<QuestionType, "code">;
    questionText: string;
    options?: Omit<MCQOption, "id">[];
    correctAnswer?: string;
    explanation?: string;
    marks: number;
    negativeMarks?: number;
    difficulty?: DifficultyLevel;
    order?: number;
    passageGroup?: string;
    passage?: string;
}

export interface UpdateQuizQuestionInput extends Partial<CreateQuizQuestionInput> {
    id: string;
    quizId: string;
}
