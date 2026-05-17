/**
 * Question types for test series
 */
export type QuestionType = "mcq" | "text_input" | "code";

/**
 * Supported programming languages for code questions
 */
export type CodeLanguage = "python" | "javascript" | "cpp" | "java";

/**
 * Starter code for a specific language
 */
export interface CodeStarter {
    language: CodeLanguage;
    code: string;
}

/**
 * Test case for code questions
 */
export interface CodeTestCase {
    id: string;
    input: string;
    expectedOutput: string;
    isHidden: boolean;
    explanation?: string;
    /** Weight of this test case when codeScoringMode is 'weighted'. Defaults to 1. */
    weight?: number;
}

/**
 * Scoring mode for code questions.
 * - all_or_nothing: full marks if all test cases pass, otherwise 0 (or negative marks).
 * - weighted: partial marks based on the sum of weights of passed test cases.
 */
export type CodeScoringMode = "all_or_nothing" | "weighted";

/**
 * Result of evaluating a submitted code answer against one test case.
 */
export interface CodeTestCaseResult {
    input: string;
    expectedOutput: string;
    actualOutput: string;
    passed: boolean;
    isHidden: boolean;
}

/**
 * Test status types
 */
export type TestStatus = "draft" | "published" | "archived";

/**
 * Test access type
 */
export type TestAccessType = "free" | "paid";

/**
 * Difficulty level
 */
export type DifficultyLevel = "easy" | "medium" | "hard";

/**
 * MCQ Option
 */
export interface MCQOption {
    id: string;
    text: string;
    isCorrect: boolean;
}

/**
 * Section within an individual test
 */
export interface TestSection {
    id: string;
    title: string;
    description?: string;
    order: number;
    marksPerQuestion?: number;
    negativeMarks?: number;
    cutoffMarks?: number;
}

export type TestSectionInput = Omit<TestSection, "id" | "order"> & {
    id?: string;
    order?: number;
};

/**
 * Individual Test within a Test Series
 */
export interface Test {
    id: string;
    seriesId: string;
    title: string;
    description: string;
    duration: number; // Duration in minutes
    totalMarks: number;
    passingMarks: number;
    totalQuestions: number;
    order: number; // Order within the series
    status: TestStatus;
    // Settings inherited or overridden from series
    instantResults: boolean;
    allowRetake: boolean;
    shuffleQuestions: boolean;
    shuffleOptions: boolean;
    sections?: TestSection[];
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Question interface
 */
export interface Question {
    id: string;
    testId: string; // References the individual Test ID
    seriesId: string; // References the parent Test Series ID
    type: QuestionType;
    questionText: string;
    options?: MCQOption[]; // For MCQ questions
    correctAnswer?: string; // For text input questions - the correct answer
    explanation?: string; // Explanation for the correct answer
    marks: number; // Marks for correct answer
    negativeMarks?: number; // Negative marks for wrong answer
    difficulty: DifficultyLevel;
    order: number; // Order of question in the test
    sectionId?: string; // Optional section within the test
    // Code question fields
    supportedLanguages?: CodeLanguage[];
    starters?: CodeStarter[];
    testCases?: CodeTestCase[];
    /** Defaults to 'all_or_nothing' for backwards compatibility. */
    codeScoringMode?: CodeScoringMode;
    timeLimit?: number; // in seconds
    memoryLimit?: number; // in MB
    // Reading comprehension / logical-set support: questions sharing the same
    // non-empty `passageGroup` are treated as one set. The `passage` (HTML)
    // is displayed above the question text. All members of a group should
    // carry the same passage value.
    passageGroup?: string;
    passage?: string;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Test Series interface (Product Container)
 */
export interface TestSeries {
    id: string;
    title: string;
    slug: string;
    description: string;
    shortDescription: string;
    thumbnailURL: string | null;
    status: TestStatus;
    accessType: TestAccessType;
    price: number;
    compareAtPrice?: number;
    category?: string;
    subcategory?: string;
    tags: string[];
    // Stats
    totalTests: number;
    totalQuestions: number;
    // Default Settings for tests in this series
    instantResults: boolean;
    allowRetake: boolean;
    shuffleQuestions: boolean;
    shuffleOptions: boolean;
    // SEO & Marketing
    metaTitle?: string;
    metaDescription?: string;
    highlights: string[];
    // Timestamps
    createdAt: Date;
    updatedAt: Date;
    createdBy: string;
}

/**
 * Test attempt status
 */
export type TestAttemptStatus = "in_progress" | "completed" | "abandoned" | "timed_out";

/**
 * User's answer to a question
 */
export interface UserAnswer {
    questionId: string;
    answer: string; // Selected option ID for MCQ, text for text input
    isCorrect?: boolean;
    marksObtained?: number;
    timeSpent?: number; // Time spent on this question in seconds
    testCaseResults?: CodeTestCaseResult[];
}

export interface TestSectionResult {
    sectionId: string;
    title: string;
    score: number;
    maxScore: number;
    cutoffMarks?: number;
    passed?: boolean;
    correctAnswers: number;
    wrongAnswers: number;
    unattempted: number;
}

/**
 * Test attempt interface
 */
export interface TestAttempt {
    id: string;
    userId: string;
    seriesId: string; // Parent series ID
    testId: string; // Specific test ID within the series
    title: string;
    attemptNumber: number;
    status: TestAttemptStatus;
    startedAt: Date;
    completedAt?: Date;
    endTime?: Date; // When the test will auto-submit
    // Progress tracking
    currentQuestionIndex: number;
    answers: UserAnswer[];
    // Results
    totalScore: number;
    maxPossibleScore: number;
    correctAnswers: number;
    wrongAnswers: number;
    unattempted: number;
    percentage: number;
    passed: boolean;
    sectionResults?: TestSectionResult[];
    sectionCutoffsPassed?: boolean;
    rank?: number; // Rank among all attempts
    percentile?: number;
    // Time tracking
    totalTimeSpent: number; // in seconds
    remainingTime?: number; // in seconds at submission
    // Analytics
    timePerQuestion?: Record<string, number>; // questionId -> time in seconds
    // Device/Session info
    ipAddress?: string;
    userAgent?: string;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Test purchase interface (links to order system)
 */
export interface TestPurchase {
    id: string;
    userId: string;
    seriesId: string; // Purchased series ID
    orderId: string;
    price: number;
    purchasedAt: Date;
    validUntil?: Date; // For time-limited access
    status: "pending" | "active" | "expired" | "consumed";
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Answer payload sent while saving or submitting an attempt.
 */
export interface TestAnswerInput {
    questionId: string;
    selectedOptionId: string;
    timeSpent: number;
}

/**
 * Test result summary for leaderboard/stats
 */
export interface TestResultSummary {
    testId: string;
    totalAttempts: number;
    averageScore: number;
    highestScore: number;
    passingRate: number;
    topPerformers: Array<{
        userId: string;
        userName: string;
        score: number;
        percentage: number;
        completedAt: Date;
    }>;
}

// ============================================================================
// INPUT TYPES
// ============================================================================

/**
 * Create test series input
 */
export interface CreateTestSeriesInput {
    title: string;
    slug: string;
    description: string;
    shortDescription: string;
    thumbnailURL?: string;
    status?: TestStatus;
    accessType: TestAccessType;
    price: number;
    compareAtPrice?: number;
    category?: string;
    subcategory?: string;
    tags?: string[];
    instantResults?: boolean;
    allowRetake?: boolean;
    shuffleQuestions?: boolean;
    shuffleOptions?: boolean;
    metaTitle?: string;
    metaDescription?: string;
    highlights?: string[];
}

/**
 * Update test series input
 */
export interface UpdateTestSeriesInput extends Partial<CreateTestSeriesInput> {
    id: string;
}

/**
 * Create test input (individual test within series)
 */
export interface CreateTestInput {
    seriesId: string;
    title: string;
    description?: string;
    duration: number;
    totalMarks: number;
    passingMarks: number;
    order?: number;
    status?: TestStatus;
    instantResults?: boolean;
    allowRetake?: boolean;
    shuffleQuestions?: boolean;
    shuffleOptions?: boolean;
    sections?: TestSectionInput[];
}

/**
 * Update test input
 */
export interface UpdateTestInput extends Partial<CreateTestInput> {
    id: string;
}

/**
 * Create question input
 */
export interface CreateQuestionInput {
    seriesId: string;
    testId: string;
    type: QuestionType;
    questionText: string;
    options?: Omit<MCQOption, "id">[]; // For MCQ
    correctAnswer?: string; // For text input
    explanation?: string;
    marks: number;
    negativeMarks?: number;
    difficulty?: DifficultyLevel;
    order?: number;
    sectionId?: string;
    // Code question fields
    supportedLanguages?: CodeLanguage[];
    starters?: CodeStarter[];
    testCases?: CodeTestCase[];
    codeScoringMode?: CodeScoringMode;
    timeLimit?: number;
    memoryLimit?: number;
    passageGroup?: string;
    passage?: string;
}

/**
 * Update question input
 */
export interface UpdateQuestionInput extends Partial<CreateQuestionInput> {
    id: string;
    seriesId: string;
    testId: string;
}

/**
 * Start test attempt input
 */
export interface StartTestAttemptInput {
    seriesId: string;
    testId: string;
    userId: string;
    deviceInfo?: {
        ip?: string;
        userAgent?: string;
    };
}

/**
 * Submit answer input
 */
export interface SubmitAnswerInput {
    attemptId: string;
    questionId: string;
    answer: string;
    timeSpent: number;
}

/**
 * Complete test attempt input
 */
export interface CompleteTestAttemptInput {
    attemptId: string;
    answers: UserAnswer[];
    totalTimeSpent: number;
}
