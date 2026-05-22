import type {
    CodeLanguage,
    CodeScoringMode,
    CodeStarter,
    CodeTestCase,
    DifficultyLevel,
    MCQOption,
    QuestionType,
    TestStatus,
} from "./test";

/**
 * Canonical question-bank records use the same runtime types as tests.
 * Legacy aliases remain in the type so older Firestore records can be read and
 * normalized instead of disappearing or crashing during conversion.
 */
export type QuestionBankLegacyType = "msq" | "nat" | "true_false" | "numerical" | "aptitude" | "subjective" | "coding";
export type QuestionBankType = QuestionType | QuestionBankLegacyType;

export interface QuestionBankQuestion {
    id: string;
    title: string;
    type: QuestionBankType;
    questionText: string;
    options?: MCQOption[];
    correctAnswer?: string;
    explanation?: string;
    marks: number;
    negativeMarks?: number;
    difficulty: DifficultyLevel;
    topic: string;
    category: string;
    subcategory?: string;
    tags: string[];
    status: TestStatus;
    supportedLanguages?: CodeLanguage[];
    starters?: CodeStarter[];
    testCases?: CodeTestCase[];
    codeScoringMode?: CodeScoringMode;
    timeLimit?: number;
    memoryLimit?: number;
    passageGroup?: string;
    passage?: string;
    usageCount: number;
    isGlobal?: boolean;
    reviewStatus?: "draft" | "pending_review" | "approved" | "rejected";
    visibility?: "private" | "submitted_for_review" | "public";
    createdAt: Date;
    updatedAt: Date;
    createdBy: string;
}

export interface CreateQuestionBankQuestionInput {
    title: string;
    type: QuestionBankType;
    questionText: string;
    options?: Omit<MCQOption, "id">[];
    correctAnswer?: string;
    explanation?: string;
    marks: number;
    negativeMarks?: number;
    difficulty?: DifficultyLevel;
    topic: string;
    category: string;
    subcategory?: string;
    tags?: string[];
    status?: TestStatus;
    supportedLanguages?: CodeLanguage[];
    starters?: CodeStarter[];
    testCases?: CodeTestCase[];
    codeScoringMode?: CodeScoringMode;
    timeLimit?: number;
    memoryLimit?: number;
    passageGroup?: string;
    passage?: string;
}

export interface UpdateQuestionBankQuestionInput extends Partial<CreateQuestionBankQuestionInput> {
    id: string;
}

export interface QuestionBankFilters {
    search?: string;
    type?: QuestionBankType | "all";
    difficulty?: DifficultyLevel | "all";
    status?: TestStatus | "all";
    topic?: string;
    category?: string;
    tags?: string[];
    includeCode?: boolean;
}
