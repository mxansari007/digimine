import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getBearerUserId } from "@/lib/server/classroomAccess";
import { executeDirect } from "@/lib/code-executor/direct";

type Question = any;
type Test = any;

const DEFAULT_JUDGE0_URL = "https://ce.judge0.com/submissions";

const PISTON_LANGUAGE_MAP: Record<string, { language: string; version: string }> = {
    python: { language: "python", version: "*" },
    javascript: { language: "javascript", version: "*" },
    cpp: { language: "cpp", version: "*" },
    java: { language: "java", version: "*" },
};

const JUDGE0_LANGUAGE_MAP: Record<string, number> = {
    python: 71,
    javascript: 63,
    cpp: 54,
    java: 62,
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
    try {
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
        const url = process.env.CODE_EXECUTION_URL || DEFAULT_JUDGE0_URL;
        if (provider === "piston") {
            const lang = PISTON_LANGUAGE_MAP[language];
            if (!lang) return { stdout: "", stderr: `Unsupported language: ${language}`, exitCode: 1 };
            const res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    language: lang.language,
                    version: lang.version,
                    files: [{ content: code }],
                    stdin: stdin || "",
                }),
            });
            if (!res.ok) return { stdout: "", stderr: "Execution service error", exitCode: 1 };
            const result = await res.json();
            const run = result.run || {};
            const compile = result.compile || {};
            const compileError = compile.stderr || "";
            const stderr = run.stderr || "";
            return {
                stdout: run.stdout || "",
                stderr: compileError
                    ? `[Compile Error]:\n${compileError}\n\n${stderr}`
                    : stderr,
                exitCode: run.code ?? -1,
            };
        }
        // Judge0
        const languageId = JUDGE0_LANGUAGE_MAP[language];
        if (!languageId) return { stdout: "", stderr: `Unsupported language: ${language}`, exitCode: 1 };
        const res = await fetch(`${url}?wait=true&base64_encoded=true`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                language_id: languageId,
                source_code: toBase64(code),
                stdin: toBase64(stdin || ""),
            }),
        });
        if (!res.ok) return { stdout: "", stderr: "Execution service error", exitCode: 1 };
        const result = await res.json();
        const stdout = fromBase64(result.stdout);
        const stderr = fromBase64(result.stderr);
        const compileOutput = fromBase64(result.compile_output);
        const exitCode = result.status?.id === 3 ? 0 : result.exit_code ?? -1;
        return {
            stdout: stdout || "",
            stderr: compileOutput ? `[Compile Error]:\n${compileOutput}\n\n${stderr}` : stderr || "",
            exitCode,
        };
    } catch {
        return { stdout: "", stderr: "Execution failed", exitCode: 1 };
    }
}

function getSectionForQuestion(test: Test | null, question: Question) {
    return (test?.sections || []).find((s: any) => s.id === question.sectionId) || null;
}

function getQuestionScoring(test: Test | null, question: Question) {
    const section = getSectionForQuestion(test, question);
    return {
        marks:
            typeof section?.marksPerQuestion === "number"
                ? section.marksPerQuestion
                : question.marks,
        negativeMarks:
            typeof section?.negativeMarks === "number"
                ? section.negativeMarks
                : question.negativeMarks || 0,
    };
}

function getMaxPossibleScore(test: Test | null, questions: Question[], fallback: number): number {
    const maxScore = questions.reduce(
        (sum: number, q: Question) => sum + getQuestionScoring(test, q).marks,
        0
    );
    return maxScore > 0 ? Math.round(maxScore * 100) / 100 : fallback;
}

export async function loadTestForGrading(
    seriesId: string,
    testId: string
): Promise<{ test: Test | null; questions: Question[] }> {
    const testSnap = await adminDb
        .collection("tests")
        .doc(seriesId)
        .collection("tests")
        .doc(testId)
        .get();
    const test = testSnap.exists ? ({ id: testSnap.id, ...testSnap.data() } as Test) : null;
    const qSnap = await adminDb
        .collection("tests")
        .doc(seriesId)
        .collection("tests")
        .doc(testId)
        .collection("questions")
        .orderBy("order", "asc")
        .get();
    const questions: Question[] = qSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return { test, questions };
}

export type TestAnswerInput = {
    questionId: string;
    selectedOptionId?: string;
    answer?: string;
    timeSpent?: number;
};

export type OwnedAttemptResult =
    | { error: { status: number; message: string }; userId?: undefined; attempt?: undefined }
    | { error?: undefined; userId: string; attempt: any };

export async function requireOwnedAttempt(req: Request, attemptId: string): Promise<OwnedAttemptResult> {
    const userId = await getBearerUserId(req);
    if (!userId) {
        return { error: { status: 401, message: "Authentication required" } };
    }
    const snap = await adminDb.collection("testAttempts").doc(attemptId).get();
    if (!snap.exists) {
        return { error: { status: 404, message: "Attempt not found" } };
    }
    const data = snap.data() || {};
    if (data.userId !== userId) {
        return { error: { status: 403, message: "You do not own this attempt" } };
    }
    return { userId, attempt: { id: snap.id, ...data } };
}

export async function saveTestAttempt(
    attemptId: string,
    data: {
        answers?: TestAnswerInput[];
        remainingTime?: number;
        currentQuestionIndex?: number;
    }
): Promise<void> {
    const ref = adminDb.collection("testAttempts").doc(attemptId);
    await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return;
        const current = snap.data() || {};
        if (current.status !== "in_progress") return;
        const update: Record<string, unknown> = { updatedAt: Timestamp.now() };
        if (data.answers !== undefined) update.answers = data.answers;
        if (data.remainingTime !== undefined) update.remainingTime = data.remainingTime;
        if (data.currentQuestionIndex !== undefined)
            update.currentQuestionIndex = data.currentQuestionIndex;
        tx.update(ref, update);
    });
}

export async function submitTestAttemptServer(
    attemptId: string,
    payload: {
        answers: TestAnswerInput[];
        remainingTime: number;
        finalStatus?: "completed" | "timed_out";
    }
): Promise<any> {
    const attemptRef = adminDb.collection("testAttempts").doc(attemptId);
    const attemptSnap = await attemptRef.get();
    if (!attemptSnap.exists) throw new Error("Attempt not found.");
    const attemptData: any = { id: attemptSnap.id, ...attemptSnap.data() };

    if (attemptData.status !== "in_progress") {
        return attemptData;
    }

    const { test, questions } = await loadTestForGrading(
        attemptData.seriesId,
        attemptData.testId
    );
    const maxPossibleScore = getMaxPossibleScore(test, questions, attemptData.maxPossibleScore);

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
    const getSectionKey = (q: Question) => {
        const section = getSectionForQuestion(test, q);
        return section?.id || "__unsectioned";
    };
    questions.forEach((q: Question) => {
        const section = getSectionForQuestion(test, q);
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
        current.maxScore += getQuestionScoring(test, q).marks;
        current.unattempted += 1;
        sectionBuckets.set(key, current);
    });

    let totalScore = 0;
    let correctAnswers = 0;
    let wrongAnswers = 0;
    const evaluatedAnswers: any[] = [];

    for (const answer of payload.answers) {
        const question = questions.find((q: Question) => q.id === answer.questionId);
        if (!question) {
            evaluatedAnswers.push({ ...answer, answer: answer.selectedOptionId });
            continue;
        }

        let isCorrect = false;
        let marksObtained = 0;
        const selectedId = answer.selectedOptionId ?? "";
        const hasSubmittedAnswer = !!(selectedId && selectedId.trim() !== "");
        const { marks, negativeMarks } = getQuestionScoring(test, question);

        if (question.type === "code") {
            let codeData: { code: string; language: string } | null = null;
            try {
                codeData = JSON.parse(selectedId);
            } catch {
                codeData = null;
            }

            if (
                codeData &&
                codeData.code &&
                codeData.language &&
                question.testCases &&
                question.testCases.length > 0
            ) {
                let allPassed = true;
                const testCaseResults: any[] = [];
                let earnedWeight = 0;
                let totalWeight = 0;

                for (const tc of question.testCases) {
                    const result = await runCode(codeData.language, codeData.code, tc.input);
                    const actualOutput = (result.stdout || "").trim();
                    const expectedOutput = (tc.expectedOutput || "").trim();
                    const passed = actualOutput === expectedOutput && result.exitCode === 0;
                    const weight = typeof tc.weight === "number" && tc.weight >= 0 ? tc.weight : 1;
                    totalWeight += weight;
                    if (passed) earnedWeight += weight;

                    testCaseResults.push({
                        input: tc.input,
                        expectedOutput: tc.expectedOutput,
                        actualOutput:
                            actualOutput + (result.stderr ? `\n[stderr]: ${result.stderr}` : ""),
                        passed,
                        isHidden: tc.isHidden,
                    });

                    if (!passed) allPassed = false;
                }

                const scoringMode = question.codeScoringMode || "all_or_nothing";
                if (scoringMode === "weighted") {
                    if (totalWeight > 0) {
                        marksObtained = (earnedWeight / totalWeight) * marks;
                        marksObtained = Math.round(marksObtained * 100) / 100;
                    }
                    isCorrect = allPassed;
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
                    timeSpent: answer.timeSpent ?? 0,
                    isCorrect,
                    marksObtained,
                    testCaseResults,
                });
            } else {
                marksObtained = -negativeMarks;
                evaluatedAnswers.push({
                    questionId: answer.questionId,
                    answer: selectedId,
                    timeSpent: answer.timeSpent ?? 0,
                    isCorrect: false,
                    marksObtained,
                    testCaseResults: [],
                });
            }
        } else {
            if (selectedId && selectedId.trim() !== "") {
                if (question.type === "mcq" && question.options) {
                    const selectedOption = question.options.find(
                        (o: any) => o.id === selectedId
                    );
                    isCorrect = selectedOption?.isCorrect || false;
                } else if (question.type === "text_input") {
                    isCorrect =
                        selectedId.trim().toLowerCase() ===
                        (question.correctAnswer || "").trim().toLowerCase();
                }
                marksObtained = isCorrect ? marks : -negativeMarks;
            }

            evaluatedAnswers.push({
                questionId: answer.questionId,
                answer: selectedId,
                timeSpent: answer.timeSpent ?? 0,
                isCorrect,
                marksObtained,
            });
        }

        const bucket = sectionBuckets.get(getSectionKey(question));
        if (bucket && hasSubmittedAnswer) {
            bucket.unattempted = Math.max(0, bucket.unattempted - 1);
            bucket.score += marksObtained;
            if (isCorrect) bucket.correctAnswers++;
            else bucket.wrongAnswers++;
        }

        if (isCorrect) correctAnswers++;
        else if (hasSubmittedAnswer) wrongAnswers++;

        totalScore += marksObtained;
    }

    const roundedSectionResults = Array.from(sectionBuckets.values()).map((section) => {
        const score = Math.round(section.score * 100) / 100;
        const maxScore = Math.round(section.maxScore * 100) / 100;
        // Strip cutoffMarks when the section doesn't define one — Firestore
        // rejects `undefined` field values, which previously surfaced as
        // "Cannot use undefined as a Firestore value (found in field
        // sectionResults.0.cutoffMarks)" on submit.
        const { cutoffMarks, ...rest } = section;
        return {
            ...rest,
            score,
            maxScore,
            ...(typeof cutoffMarks === "number" ? { cutoffMarks } : {}),
            passed: cutoffMarks === undefined || score >= cutoffMarks,
        };
    });
    const sectionCutoffsPassed = roundedSectionResults.every((s) => s.passed !== false);
    const percentage = maxPossibleScore > 0 ? (totalScore / maxPossibleScore) * 100 : 0;
    const passed =
        (test ? totalScore >= (test.passingMarks || 0) : percentage >= 40) &&
        sectionCutoffsPassed;

    const now = Timestamp.now();
    const updatedAttempt = {
        status: payload.finalStatus || "completed",
        completedAt: now.toDate(),
        answers: evaluatedAnswers,
        totalScore: Math.round(totalScore * 100) / 100,
        maxPossibleScore,
        correctAnswers,
        wrongAnswers,
        unattempted:
            questions.length -
            payload.answers.filter(
                (a) => a.selectedOptionId && a.selectedOptionId.trim() !== ""
            ).length,
        percentage: Math.round(percentage * 100) / 100,
        passed,
        sectionResults: roundedSectionResults,
        sectionCutoffsPassed,
        updatedAt: now.toDate(),
        remainingTime: payload.remainingTime,
    };

    const finalAttempt = await adminDb.runTransaction(async (tx) => {
        const fresh = await tx.get(attemptRef);
        if (!fresh.exists) throw new Error("Attempt not found.");
        const current: any = fresh.data() || {};
        if (current.status !== "in_progress") {
            return { id: fresh.id, ...current };
        }
        tx.update(attemptRef, updatedAttempt);
        return { id: fresh.id, ...current, ...updatedAttempt };
    });

    return finalAttempt;
}

export function serializeTestAttempt(attempt: any) {
    const toIso = (val: any) => {
        if (!val) return null;
        if (typeof val.toDate === "function") return val.toDate().toISOString();
        if (val instanceof Date) return val.toISOString();
        if (typeof val === "string") return val;
        if (typeof val.seconds === "number")
            return new Date(val.seconds * 1000).toISOString();
        return null;
    };
    return {
        ...attempt,
        startedAt: toIso(attempt.startedAt),
        completedAt: toIso(attempt.completedAt),
        createdAt: toIso(attempt.createdAt),
        updatedAt: toIso(attempt.updatedAt),
        endTime: toIso(attempt.endTime),
    };
}
