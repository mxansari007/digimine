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

export interface QuestionBankQuestion {
    id: string;
    title: string;
    type: QuestionType;
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
    createdAt: Date;
    updatedAt: Date;
    createdBy: string;
}

export interface CreateQuestionBankQuestionInput {
    title: string;
    type: QuestionType;
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
    type?: QuestionType | "all";
    difficulty?: DifficultyLevel | "all";
    status?: TestStatus | "all";
    topic?: string;
    category?: string;
    tags?: string[];
    includeCode?: boolean;
}
