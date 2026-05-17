"use client";

import {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    query,
    where,
    orderBy,
    limit,
    Timestamp,
    arrayUnion,
    runTransaction,
    type DocumentData,
} from "firebase/firestore";
import { db } from "../firebase/client";
import type { 
    TestSeries, 
    Test,
    Question, 
    TestAttempt, 
    TestPurchase,
    TestAnswerInput,
} from "@digimine/types";
import { v4 as uuidv4 } from "uuid";

// Collection Refs
const testsCollection = collection(db, "tests");
const testPurchasesCollection = collection(db, "testPurchases");
const testAttemptsCollection = collection(db, "testAttempts");

// --- Helper Functions ---

function mapDoc<T>(doc: DocumentData): T {
    const data = doc.data();
    
    // Helper to safely convert to Date
    const toDate = (val: any) => {
        if (!val) return undefined;
        if (typeof val.toDate === "function") return val.toDate();
        if (typeof val === "string") return new Date(val);
        if (val.seconds !== undefined) return new Date(val.seconds * 1000);
        return val;
    };

    return {
        id: doc.id,
        ...data,
        createdAt: toDate(data.createdAt),
        updatedAt: toDate(data.updatedAt),
        startedAt: toDate(data.startedAt),
        completedAt: toDate(data.completedAt),
        purchasedAt: toDate(data.purchasedAt),
        validUntil: toDate(data.validUntil),
        endTime: toDate(data.endTime),
    } as T;
}

function mapDocs<T>(snapshot: { docs: DocumentData[] }): T[] {
    return snapshot.docs.map((doc) => mapDoc<T>(doc));
}

function getSectionForQuestion(test: Test | null, question: Question) {
    return (test?.sections || []).find((section) => section.id === question.sectionId) || null;
}

function getQuestionScoring(test: Test | null, question: Question) {
    const section = getSectionForQuestion(test, question);
    return {
        marks: typeof section?.marksPerQuestion === "number" ? section.marksPerQuestion : question.marks,
        negativeMarks: typeof section?.negativeMarks === "number" ? section.negativeMarks : (question.negativeMarks || 0),
    };
}

function getMaxPossibleScore(test: Test | null, questions: Question[], fallback: number): number {
    const maxScore = questions.reduce((sum, question) => sum + getQuestionScoring(test, question).marks, 0);
    return maxScore > 0 ? Math.round(maxScore * 100) / 100 : fallback;
}

// --- Test Series (Public) ---

export async function getPublishedTestSeries(filters?: { category?: string }): Promise<TestSeries[]> {
    let q = query(
        testsCollection, 
        where("status", "==", "published"),
        orderBy("createdAt", "desc")
    );

    if (filters?.category) {
        q = query(q, where("category", "==", filters.category));
    }

    const snapshot = await getDocs(q);
    return mapDocs<TestSeries>(snapshot);
}

// Backward compatibility
export const getPublishedTests = getPublishedTestSeries;

export async function getTestSeriesBySlug(slug: string): Promise<TestSeries | null> {
    const docRef = doc(testsCollection, slug);
    const snapshot = await getDoc(docRef);
    if (snapshot.exists()) {
        return mapDoc<TestSeries>(snapshot);
    }

    const slugQuery = query(testsCollection, where("slug", "==", slug), limit(1));
    const slugSnapshot = await getDocs(slugQuery);
    if (slugSnapshot.empty) return null;

    return mapDoc<TestSeries>(slugSnapshot.docs[0]);
}

// Backward compatibility
export const getTestBySlug = getTestSeriesBySlug;
export const getTestSeries = getTestSeriesBySlug;

export async function getTestsInSeries(seriesId: string): Promise<Test[]> {
    const seriesRef = doc(testsCollection, seriesId);
    const testsSubCollection = collection(seriesRef, "tests");
    // Filter for published tests in the public view
    const q = query(
        testsSubCollection, 
        where("status", "==", "published"),
        orderBy("order", "asc")
    );
    const snapshot = await getDocs(q);
    return mapDocs<Test>(snapshot);
}

export async function getTestById(seriesId: string, testId: string): Promise<Test | null> {
    const testRef = doc(db, "tests", seriesId, "tests", testId);
    const snapshot = await getDoc(testRef);
    if (!snapshot.exists()) return null;
    return mapDoc<Test>(snapshot);
}

// --- Questions ---

export async function getTestQuestions(seriesId: string, testId: string): Promise<Question[]> {
    const questionsCollection = collection(db, "tests", seriesId, "tests", testId, "questions");
    const q = query(questionsCollection, orderBy("order", "asc"));
    const snapshot = await getDocs(q);
    return mapDocs<Question>(snapshot);
}

// --- Test Purchases ---

export async function getUserTestPurchases(userId: string): Promise<TestPurchase[]> {
    const q = query(
        testPurchasesCollection,
        where("userId", "==", userId)
    );
    const snapshot = await getDocs(q);
    return mapDocs<TestPurchase>(snapshot).sort(
        (a, b) => b.purchasedAt.getTime() - a.purchasedAt.getTime()
    );
}

export async function hasUserPurchasedTest(userId: string, seriesId: string): Promise<boolean> {
    const q = query(
        testPurchasesCollection,
        where("userId", "==", userId)
    );
    const snapshot = await getDocs(q);
    return mapDocs<TestPurchase>(snapshot).some(
        (purchase) => purchase.seriesId === seriesId && purchase.status === "active"
    );
}

export async function getTestPurchaseByOrderId(orderId: string): Promise<TestPurchase | null> {
    const q = query(testPurchasesCollection, where("orderId", "==", orderId), limit(1));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    return mapDoc<TestPurchase>(snapshot.docs[0]);
}

// --- Test Attempts ---

/**
 * Sync remaining time and auto-submit expired in-progress attempts.
 * Returns true if the attempt was timed out.
 */
async function syncAndTimeoutAttempt(attempt: TestAttempt): Promise<boolean> {
    if (attempt.status !== 'in_progress') return false;

    let endTime = attempt.endTime;
    if (!endTime && attempt.updatedAt && attempt.remainingTime) {
        endTime = new Date(attempt.updatedAt.getTime() + attempt.remainingTime * 1000);
    }

    if (!endTime) return false;

    const now = new Date();
    const remaining = Math.max(0, Math.floor((endTime.getTime() - now.getTime()) / 1000));
    attempt.remainingTime = remaining;

    if (remaining <= 0) {
        // Auto-submit with empty answers
        try {
            await submitTestAttempt(attempt.id, {
                answers: [],
                remainingTime: 0,
                finalStatus: "timed_out",
            });
            attempt.status = 'timed_out';
            attempt.remainingTime = 0;
        } catch {
            // If submit fails (e.g. already completed), just mark locally
            attempt.status = 'timed_out';
            attempt.remainingTime = 0;
        }
        return true;
    }

    return false;
}

export async function startTestAttempt(
    userId: string,
    seriesId: string,
    testId: string,
    deviceInfo?: { ip?: string; userAgent?: string }
): Promise<TestAttempt> {
    // Keep these queries simple to avoid composite-index failures on first deploy.
    const activeAttemptsQuery = query(
        testAttemptsCollection,
        where("userId", "==", userId)
    );
    const activeAttemptsSnapshot = await getDocs(activeAttemptsQuery);
    const userAttempts = mapDocs<TestAttempt>(activeAttemptsSnapshot);
    const previousTestAttempts = userAttempts.filter((attempt) => attempt.testId === testId);
    const activeAttempts = userAttempts
        .filter((attempt) => attempt.status === "in_progress")
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    // 1. Check for an existing in-progress attempt for THIS SPECIFIC test
    const existingThisTest = activeAttempts.find((attempt) => attempt.testId === testId);
    if (existingThisTest) {
        const attempt = existingThisTest;
        const wasTimedOut = await syncAndTimeoutAttempt(attempt);
        if (!wasTimedOut) {
            return attempt;
        }
        // If timed out, fall through to create a new attempt
    }

    // 2. Check for ANY other in-progress attempt globally (enforce single active test)
    const otherActiveAttempt = activeAttempts.find((attempt) => attempt.testId !== testId);
    if (otherActiveAttempt) {
        const otherAttempt = otherActiveAttempt;
        const wasTimedOut = await syncAndTimeoutAttempt(otherAttempt);
        if (!wasTimedOut) {
            // Another test is still active and not timed out
            throw new Error(
                `You already have an active test: "${otherAttempt.title}". Please finish or submit it before starting a new one.`
            );
        }
        // If timed out, we can proceed to create a new attempt
    }

    // 3. Count previous attempts for this specific test to name the new one
    const attemptNumber = previousTestAttempts.length + 1;

    const attemptId = uuidv4();
    const test = await getTestById(seriesId, testId);
    if (!test) throw new Error("Test not found");
    const questions = await getTestQuestions(seriesId, testId);
    const maxPossibleScore = getMaxPossibleScore(test, questions, test.totalMarks);

    if (!test.allowRetake && previousTestAttempts.some((attempt) => attempt.status === "completed" || attempt.status === "timed_out")) {
        throw new Error("Retakes are disabled for this test.");
    }

    const now = Timestamp.now();
    const durationInSeconds = test.duration * 60;
    const endTime = new Date(now.toDate().getTime() + durationInSeconds * 1000);

    const attemptData: any = {
        userId,
        seriesId,
        testId,
        attemptNumber,
        title: `Attempt ${attemptNumber}`,
        status: "in_progress",
        startedAt: now.toDate(),
        endTime: endTime,
        currentQuestionIndex: 0,
        answers: [],
        totalScore: 0,
        maxPossibleScore,
        correctAnswers: 0,
        wrongAnswers: 0,
        unattempted: questions.length || test.totalQuestions,
        percentage: 0,
        passed: false,
        totalTimeSpent: 0,
        remainingTime: durationInSeconds,
        createdAt: now.toDate(),
        updatedAt: now.toDate(),
    };

    // Only add device info fields if they have values (Firestore rejects undefined)
    if (deviceInfo?.ip) attemptData.ipAddress = deviceInfo.ip;
    if (deviceInfo?.userAgent) attemptData.userAgent = deviceInfo.userAgent;

    const docRef = doc(testAttemptsCollection, attemptId);
    await setDoc(docRef, attemptData);

    // Reconciliation: after the new attempt is created, mark any leftover
    // duplicate in-progress attempts for the SAME test as abandoned. This
    // prevents the rare case where a previous run finished partially and left
    // an orphan in_progress doc lingering.
    try {
        await Promise.all(
            previousTestAttempts
                .filter((a) => a.id !== attemptId && a.status === "in_progress")
                .map((a) =>
                    updateDoc(doc(testAttemptsCollection, a.id), {
                        status: "abandoned",
                        completedAt: Timestamp.now().toDate(),
                        updatedAt: Timestamp.now().toDate(),
                    })
                )
        );
    } catch (e) {
        // Reconciliation is best-effort; don't fail the new attempt over it.
        console.warn("Stale attempt reconciliation failed:", e);
    }

    return { id: attemptId, ...attemptData };
}

export async function getTestAttempt(attemptId: string): Promise<TestAttempt | null> {
    const attemptRef = doc(testAttemptsCollection, attemptId);
    const snapshot = await getDoc(attemptRef);
    if (!snapshot.exists()) return null;

    const attempt = mapDoc<TestAttempt>(snapshot);

    // Sync remaining time and auto-submit expired attempts
    await syncAndTimeoutAttempt(attempt);

    return attempt;
}

/**
 * Fetch the latest completed attempt for every user that has taken a given test.
 * Used to compute ranking / score distribution.
 */
export async function getLatestAttemptsForTest(testId: string): Promise<TestAttempt[]> {
    const q = query(testAttemptsCollection, where("testId", "==", testId));
    const snapshot = await getDocs(q);
    const attempts = mapDocs<TestAttempt>(snapshot).filter(
        (a) => a.status === "completed" || a.status === "timed_out"
    );

    // Keep only the latest completed attempt per user
    const latestByUser = new Map<string, TestAttempt>();
    for (const attempt of attempts) {
        const existing = latestByUser.get(attempt.userId);
        const completedAt = attempt.completedAt?.getTime?.() ?? attempt.updatedAt?.getTime?.() ?? 0;
        const existingCompletedAt = existing?.completedAt?.getTime?.() ?? existing?.updatedAt?.getTime?.() ?? 0;
        if (!existing || completedAt > existingCompletedAt) {
            latestByUser.set(attempt.userId, attempt);
        }
    }
    return Array.from(latestByUser.values());
}

export async function getUserTestAttempts(userId: string, seriesId?: string, testId?: string): Promise<TestAttempt[]> {
    const q = query(
        testAttemptsCollection,
        where("userId", "==", userId)
    );

    const snapshot = await getDocs(q);
    const attempts = mapDocs<TestAttempt>(snapshot)
        .filter((attempt) => !seriesId || attempt.seriesId === seriesId)
        .filter((attempt) => !testId || attempt.testId === testId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    // Sync time and auto-submit expired in-progress attempts
    for (const attempt of attempts) {
        if (attempt.status === 'in_progress') {
            await syncAndTimeoutAttempt(attempt);
        }
    }

    return attempts;
}

export async function updateTestAttempt(
    attemptId: string,
    data: {
        answers?: TestAnswerInput[];
        remainingTime?: number;
        currentQuestionIndex?: number;
    }
): Promise<void> {
    const attemptRef = doc(testAttemptsCollection, attemptId);
    const updateData: Record<string, any> = {
        updatedAt: Timestamp.now(),
    };
    if (data.answers !== undefined) {
        updateData.answers = data.answers.map(a => ({
            questionId: a.questionId,
            answer: a.selectedOptionId,
            timeSpent: a.timeSpent
        }));
    }
    if (data.remainingTime !== undefined) {
        updateData.remainingTime = data.remainingTime;
    }
    if (data.currentQuestionIndex !== undefined) {
        updateData.currentQuestionIndex = data.currentQuestionIndex;
    }

    // Use a transaction so we never overwrite a doc that has already been
    // finalized (completed / timed_out / abandoned). Without this, a stale
    // autosave can flip the status indicator back to "in progress" simply by
    // bumping fields like `updatedAt` after the attempt is already done.
    await runTransaction(db, async (tx) => {
        const snap = await tx.get(attemptRef);
        if (!snap.exists()) return;
        const current = mapDoc<TestAttempt>(snap);
        if (current.status !== "in_progress") return; // ignore stale writes
        tx.update(attemptRef, updateData);
    });
}

/**
 * Explicitly abandon an in-progress attempt. Used by the dashboard's
 * "Discard attempt" affordance so users can self-recover from a stuck
 * attempt without contacting support.
 */
export async function abandonTestAttempt(attemptId: string): Promise<void> {
    const attemptRef = doc(testAttemptsCollection, attemptId);
    await runTransaction(db, async (tx) => {
        const snap = await tx.get(attemptRef);
        if (!snap.exists()) return;
        const current = mapDoc<TestAttempt>(snap);
        if (current.status !== "in_progress") return; // already finalized
        tx.update(attemptRef, {
            status: "abandoned",
            completedAt: Timestamp.now().toDate(),
            updatedAt: Timestamp.now().toDate(),
        });
    });
}

// ============================================================
// Code Execution Backend
// Supports: Direct (child_process), Piston (self-hosted), Judge0 CE
// ============================================================

import { executeDirect } from "@/lib/code-executor/direct";

const DEFAULT_JUDGE0_URL = "https://ce.judge0.com/submissions";

const JUDGE0_LANGUAGE_MAP: Record<string, number> = {
    python: 71,
    javascript: 63,
    cpp: 54,
    java: 62,
};

const PISTON_LANGUAGE_MAP: Record<string, { language: string; version: string }> = {
    python: { language: "python", version: "*" },
    javascript: { language: "javascript", version: "*" },
    cpp: { language: "cpp", version: "*" },
    java: { language: "java", version: "*" },
};

function toBase64(str: string): string {
    return Buffer.from(str, "utf-8").toString("base64");
}

function fromBase64(str: string | null): string {
    if (!str) return "";
    return Buffer.from(str, "base64").toString("utf-8");
}

function detectProvider(): "direct" | "piston" | "judge0" {
    const provider = process.env.CODE_EXECUTION_PROVIDER;
    if (provider === "direct") return "direct";
    if (provider === "piston") return "piston";
    if (provider === "judge0") return "judge0";

    const url = process.env.CODE_EXECUTION_URL;
    if (!url) return "judge0";
    if (url.includes("judge0")) return "judge0";
    if (url.includes("piston") || url.endsWith("/api/v2/execute")) return "piston";
    return "judge0";
}

async function runCode(
    language: string,
    code: string,
    stdin: string
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const provider = detectProvider();

    if (provider === "direct") {
        const result = await executeDirect(language, code, stdin);
        return {
            stdout: result.stdout,
            stderr: result.compileOutput
                ? `[Compile Error]:\n${result.compileOutput}\n\n${result.stderr}`
                : result.stderr,
            exitCode: result.exitCode,
        };
    }

    const executionUrl = process.env.CODE_EXECUTION_URL || DEFAULT_JUDGE0_URL;
    if (provider === "piston") {
        return runCodeOnPiston(executionUrl, language, code, stdin);
    }
    return runCodeOnJudge0(executionUrl, language, code, stdin);
}

async function runCodeOnPiston(
    url: string,
    language: string,
    code: string,
    stdin: string
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const pistonLang = PISTON_LANGUAGE_MAP[language];
    if (!pistonLang) {
        return { stdout: "", stderr: `Unsupported language: ${language}`, exitCode: 1 };
    }

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                language: pistonLang.language,
                version: pistonLang.version,
                files: [{ content: code }],
                stdin: stdin || "",
            }),
        });

        if (!response.ok) {
            return { stdout: "", stderr: "Execution service error", exitCode: 1 };
        }

        const result = await response.json();
        const run = result.run || {};
        const compile = result.compile || {};
        const compileError = compile.stderr || "";
        const stderr = run.stderr || "";
        const fullStderr = compileError ? `[Compile Error]:\n${compileError}\n\n${stderr}` : stderr;

        return {
            stdout: run.stdout || "",
            stderr: fullStderr,
            exitCode: run.code ?? -1,
        };
    } catch {
        return { stdout: "", stderr: "Execution failed", exitCode: 1 };
    }
}

async function runCodeOnJudge0(
    url: string,
    language: string,
    code: string,
    stdin: string
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const languageId = JUDGE0_LANGUAGE_MAP[language];
    if (!languageId) {
        return { stdout: "", stderr: `Unsupported language: ${language}`, exitCode: 1 };
    }

    try {
        const response = await fetch(`${url}?wait=true&base64_encoded=true`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                language_id: languageId,
                source_code: toBase64(code),
                stdin: toBase64(stdin || ""),
            }),
        });

        if (!response.ok) {
            return { stdout: "", stderr: "Execution service error", exitCode: 1 };
        }

        const result = await response.json();
        const stdout = fromBase64(result.stdout);
        const stderr = fromBase64(result.stderr);
        const compileOutput = fromBase64(result.compile_output);
        const exitCode = result.status?.id === 3 ? 0 : (result.exit_code ?? -1);

        const fullStderr = compileOutput ? `[Compile Error]:\n${compileOutput}\n\n${stderr}` : stderr;

        return {
            stdout: stdout || "",
            stderr: fullStderr || "",
            exitCode,
        };
    } catch {
        return { stdout: "", stderr: "Execution failed", exitCode: 1 };
    }
}

export async function submitTestAttempt(
    attemptId: string,
    data: {
        answers: TestAnswerInput[];
        remainingTime: number;
        finalStatus?: "completed" | "timed_out";
    }
): Promise<TestAttempt> {
    const attemptRef = doc(testAttemptsCollection, attemptId);
    const attemptSnapshot = await getDoc(attemptRef);
    const attempt = attemptSnapshot.exists() ? mapDoc<TestAttempt>(attemptSnapshot) : null;

    if (!attempt) {
        throw new Error("Attempt not found.");
    }

    // Idempotent submit: if the attempt is already finalized, return the
    // existing record instead of throwing. This eliminates the race where the
    // timer auto-submits at the same moment the user clicks Submit.
    if (attempt.status !== "in_progress") {
        return attempt;
    }

    const [test, questions] = await Promise.all([
        getTestById(attempt.seriesId, attempt.testId),
        getTestQuestions(attempt.seriesId, attempt.testId),
    ]);
    const maxPossibleScore = getMaxPossibleScore(test, questions, attempt.maxPossibleScore);

    type SectionBucket = {
        sectionId: string;
        title: string;
        score: number;
        maxScore: number;
        cutoffMarks?: number;
        correctAnswers: number;
        wrongAnswers: number;
        unattempted: number;
    };
    const sectionBuckets = new Map<string, SectionBucket>();
    const getSectionKey = (question: Question) => {
        const section = getSectionForQuestion(test, question);
        return section?.id || "__unsectioned";
    };
    questions.forEach((question) => {
        const section = getSectionForQuestion(test, question);
        const key = section?.id || "__unsectioned";
        const current = sectionBuckets.get(key) || {
            sectionId: section?.id || "",
            title: section?.title || "Unsectioned",
            score: 0,
            maxScore: 0,
            cutoffMarks: section?.cutoffMarks,
            correctAnswers: 0,
            wrongAnswers: 0,
            unattempted: 0,
        };
        current.maxScore += getQuestionScoring(test, question).marks;
        current.unattempted += 1;
        sectionBuckets.set(key, current);
    });

    let totalScore = 0;
    let correctAnswers = 0;
    let wrongAnswers = 0;

    const evaluatedAnswers: any[] = [];

    for (const answer of data.answers) {
        const question = questions.find((q) => q.id === answer.questionId);
        if (!question) {
            evaluatedAnswers.push({ ...answer, answer: answer.selectedOptionId });
            continue;
        }

        let isCorrect = false;
        let marksObtained = 0;
        const selectedId = answer.selectedOptionId;
        const hasSubmittedAnswer = !!(selectedId && selectedId.trim() !== "");
        const { marks, negativeMarks } = getQuestionScoring(test, question);

        if (question.type === "code") {
            // Parse code answer
            let codeData: { code: string; language: string } | null = null;
            try {
                codeData = JSON.parse(selectedId);
            } catch {
                codeData = null;
            }

            if (codeData && codeData.code && codeData.language && question.testCases && question.testCases.length > 0) {
                let allPassed = true;
                const testCaseResults: Array<{ input: string; expectedOutput: string; actualOutput: string; passed: boolean; isHidden: boolean }> = [];
                let earnedWeight = 0;
                let totalWeight = 0;

                for (const tc of question.testCases) {
                    const result = await runCode(codeData.language, codeData.code, tc.input);
                    const actualOutput = result.stdout.trim();
                    const expectedOutput = tc.expectedOutput.trim();
                    const passed = actualOutput === expectedOutput && result.exitCode === 0;
                    const weight = typeof tc.weight === "number" && tc.weight >= 0 ? tc.weight : 1;
                    totalWeight += weight;
                    if (passed) earnedWeight += weight;

                    testCaseResults.push({
                        input: tc.input,
                        expectedOutput: tc.expectedOutput,
                        actualOutput: actualOutput + (result.stderr ? `\n[stderr]: ${result.stderr}` : ""),
                        passed,
                        isHidden: tc.isHidden,
                    });

                    if (!passed) allPassed = false;
                }

                const scoringMode = question.codeScoringMode || "all_or_nothing";
                if (scoringMode === "weighted") {
                    if (totalWeight > 0) {
                        marksObtained = (earnedWeight / totalWeight) * marks;
                        // Round to 2 decimal places to keep totals tidy
                        marksObtained = Math.round(marksObtained * 100) / 100;
                    } else {
                        marksObtained = 0;
                    }
                    // Treat as fully correct only if every case passed
                    isCorrect = allPassed;
                    // Apply negative marking only when nothing was earned
                    if (earnedWeight === 0 && negativeMarks) {
                        marksObtained = -negativeMarks;
                    }
                } else {
                    isCorrect = allPassed;
                    marksObtained = isCorrect ? marks : -negativeMarks;
                }

                evaluatedAnswers.push({
                    questionId: answer.questionId,
                    answer: selectedId,
                    timeSpent: answer.timeSpent,
                    isCorrect,
                    marksObtained,
                    testCaseResults,
                });
            } else {
                // No code submitted or no test cases
                marksObtained = -negativeMarks;
                evaluatedAnswers.push({
                    questionId: answer.questionId,
                    answer: selectedId,
                    timeSpent: answer.timeSpent,
                    isCorrect: false,
                    marksObtained,
                    testCaseResults: [],
                });
            }
        } else {
            // MCQ or text_input
            if (selectedId && selectedId.trim() !== "") {
                if (question.type === "mcq" && question.options) {
                    const selectedOption = question.options.find((o) => o.id === selectedId);
                    isCorrect = selectedOption?.isCorrect || false;
                } else if (question.type === "text_input") {
                    isCorrect = selectedId.trim().toLowerCase() === (question.correctAnswer || "").trim().toLowerCase();
                }
                marksObtained = isCorrect ? marks : -negativeMarks;
            }

            evaluatedAnswers.push({
                questionId: answer.questionId,
                answer: selectedId,
                timeSpent: answer.timeSpent,
                isCorrect,
                marksObtained,
            });
        }

        const sectionBucket = sectionBuckets.get(getSectionKey(question));
        if (sectionBucket && hasSubmittedAnswer) {
            sectionBucket.unattempted = Math.max(0, sectionBucket.unattempted - 1);
            sectionBucket.score += marksObtained;
            if (isCorrect) sectionBucket.correctAnswers++;
            else sectionBucket.wrongAnswers++;
        }

        if (isCorrect) correctAnswers++;
        else if (hasSubmittedAnswer) {
            wrongAnswers++;
        }

        totalScore += marksObtained;
    }

    const roundedSectionResults = Array.from(sectionBuckets.values()).map((section) => {
        const score = Math.round(section.score * 100) / 100;
        const maxScore = Math.round(section.maxScore * 100) / 100;
        return {
            ...section,
            score,
            maxScore,
            passed: section.cutoffMarks === undefined || score >= section.cutoffMarks,
        };
    });
    const sectionCutoffsPassed = roundedSectionResults.every((section) => section.passed !== false);
    const percentage = maxPossibleScore > 0 ? (totalScore / maxPossibleScore) * 100 : 0;
    const passed = (test ? totalScore >= test.passingMarks : percentage >= 40) && sectionCutoffsPassed;

    const now = Timestamp.now();
    const updatedAttempt = {
        status: data.finalStatus || "completed",
        completedAt: now.toDate(),
        answers: evaluatedAnswers,
        totalScore: Math.round(totalScore * 100) / 100,
        maxPossibleScore,
        correctAnswers,
        wrongAnswers,
        unattempted: questions.length - data.answers.filter((a) => a.selectedOptionId && a.selectedOptionId.trim() !== "").length,
        percentage: Math.round(percentage * 100) / 100,
        passed,
        sectionResults: roundedSectionResults,
        sectionCutoffsPassed,
        updatedAt: now.toDate(),
        remainingTime: data.remainingTime
    };

    // Transactional commit: re-read at commit time and skip the write if a
    // concurrent path (e.g. timer auto-submit) already finalized the attempt.
    // This guarantees the attempt cannot end up in an inconsistent partially
    // updated state across racing callers.
    const finalAttempt = await runTransaction(db, async (tx) => {
        const fresh = await tx.get(attemptRef);
        if (!fresh.exists()) {
            throw new Error("Attempt not found.");
        }
        const current = mapDoc<TestAttempt>(fresh);
        if (current.status !== "in_progress") {
            // Already finalized by someone else — return what's in the DB.
            return current;
        }
        tx.update(attemptRef, updatedAttempt);
        return { ...current, ...updatedAttempt } as TestAttempt;
    });

    return finalAttempt;
}

export async function createTestPurchase(
    userId: string,
    seriesId: string,
    orderId: string,
    price: number
): Promise<TestPurchase> {
    const purchaseId = uuidv4();
    const purchaseRef = doc(testPurchasesCollection, purchaseId);
    const now = Timestamp.now();
    
    const purchaseData: Omit<TestPurchase, "id"> = {
        userId,
        seriesId,
        orderId,
        price,
        purchasedAt: now.toDate(),
        status: "active",
        createdAt: now.toDate(),
        updatedAt: now.toDate(),
    };
    
    await setDoc(purchaseRef, purchaseData);
    await setDoc(doc(db, "users", userId), {
        purchasedTests: arrayUnion(seriesId),
        purchasedTestSeriesIds: arrayUnion(seriesId),
        updatedAt: now.toDate(),
    }, { merge: true });

    return { id: purchaseId, ...purchaseData };
}

export async function enrollInFreeTestSeries(userId: string, seriesId: string): Promise<TestPurchase> {
    const existingPurchase = await getUserActiveTestPurchase(userId, seriesId);
    if (existingPurchase) {
        return existingPurchase;
    }

    const purchaseId = `${userId}_${seriesId}`;
    const purchaseRef = doc(testPurchasesCollection, purchaseId);
    const existingRefSnapshot = await getDoc(purchaseRef);
    if (existingRefSnapshot.exists()) {
        const existing = mapDoc<TestPurchase>(existingRefSnapshot);
        if (existing.status === "active") {
            return existing;
        }
    }

    const now = Timestamp.now();
    
    const purchaseData: Omit<TestPurchase, "id"> = {
        userId,
        seriesId,
        orderId: "free-enrollment",
        price: 0,
        purchasedAt: now.toDate(),
        status: "active",
        createdAt: now.toDate(),
        updatedAt: now.toDate(),
    };
    
    await setDoc(purchaseRef, purchaseData);
    await setDoc(doc(db, "users", userId), {
        purchasedTests: arrayUnion(seriesId),
        purchasedTestSeriesIds: arrayUnion(seriesId),
        updatedAt: now.toDate(),
    }, { merge: true });

    return { id: purchaseId, ...purchaseData };
}

export async function getUserActiveTestPurchase(userId: string, seriesId: string): Promise<TestPurchase | null> {
    const q = query(
        testPurchasesCollection,
        where("userId", "==", userId)
    );
    
    const snapshot = await getDocs(q);
    const purchases = mapDocs<TestPurchase>(snapshot);
    return purchases.find(
        (purchase) => purchase.seriesId === seriesId && purchase.status === "active"
    ) || null;
}
