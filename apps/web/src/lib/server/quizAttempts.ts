import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { previewAttemptOverlay } from "@/lib/server/userRole";

export type SanitizedQuizQuestion = {
    id: string;
    quizId: string;
    type: "mcq" | "text_input";
    questionText: string;
    options?: Array<{ id: string; text: string }>;
    marks: number;
    negativeMarks: number;
    difficulty: string;
    order: number;
    passageGroup?: string;
    passage?: string;
};

export type QuizAttemptPayload = {
    id: string;
    userId: string;
    quizId: string;
    contestId?: string;
    sourceType?: "quiz" | "contest";
    contestTitle?: string;
    title: string;
    attemptNumber: number;
    status: "in_progress" | "completed" | "timed_out" | "abandoned";
    startedAt: string;
    completedAt?: string;
    endTime?: string;
    currentQuestionIndex: number;
    answers: Array<{ questionId: string; answer: string; timeSpent?: number }>;
    totalScore: number;
    maxPossibleScore: number;
    correctAnswers: number;
    wrongAnswers: number;
    skipped: number;
    percentage: number;
    passed?: boolean | null;
    passingPercentage?: number;
    questionResults?: QuestionResult[];
    totalTimeSpent: number;
    remainingTime?: number;
    createdAt: string;
    updatedAt: string;
};

type QuizRecord = {
    id: string;
    slug?: string;
    title?: string;
    status?: string;
    accessType?: "free" | "course_only";
    linkedCourseIds?: string[];
    teacherId?: string;
    /** Institute-authored content stamps this; teacherId is empty in that case. */
    instituteId?: string;
    /** Class-centric assignment — IDs of classes this quiz is published into. */
    classIds?: string[];
    visibility?: string;
    timeLimitMinutes?: number;
    passingPercentage?: number;
    shuffleQuestions?: boolean;
    shuffleOptions?: boolean;
    /** Release date — see Quiz type. The runtime value can be a Date,
     *  Firestore Timestamp, or ISO string depending on the read path. */
    availableFrom?: unknown;
};

type CourseRecord = {
    id: string;
    slug?: string;
    title?: string;
    status?: string;
    accessType?: "free" | "enrollment_required";
    linkedQuizzes?: Array<{ id?: string; quizId?: string; url?: string }>;
};

type RawQuizQuestion = {
    id: string;
    quizId: string;
    type: "mcq" | "text_input";
    questionText: string;
    options?: Array<{ id: string; text: string; isCorrect?: boolean }>;
    correctAnswer?: string;
    explanation?: string;
    marks?: number;
    negativeMarks?: number;
    difficulty?: string;
    order?: number;
    passageGroup?: string;
    passage?: string;
};

type RawAttempt = {
    id: string;
    userId: string;
    quizId: string;
    contestId?: string;
    sourceType?: "quiz" | "contest";
    contestTitle?: string;
    title: string;
    attemptNumber: number;
    status: "in_progress" | "completed" | "timed_out" | "abandoned";
    startedAt: unknown;
    completedAt?: unknown;
    endTime?: unknown;
    currentQuestionIndex: number;
    answers: Array<{ questionId: string; answer: string; timeSpent?: number; isCorrect?: boolean; marksObtained?: number }>;
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
    questionResults?: QuestionResult[];
    totalTimeSpent: number;
    remainingTime?: number;
    createdAt: unknown;
    updatedAt: unknown;
};

type ContestAttemptContext = {
    contestId: string;
    title: string;
    startTime: Date;
    endTime: Date;
};

export type QuestionResult = {
    questionId: string;
    status: "correct" | "wrong" | "skipped";
    selectedAnswer: string;
    correctOptionIds?: string[];
    correctAnswer?: string;
    explanation?: string;
    earnedMarks: number;
    questionMarks: number;
    negativeMarks: number;
};

export async function getAuthenticatedUserId(req: Request): Promise<string | null> {
    const header = req.headers.get("authorization") || "";
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (!match) return null;
    const decoded = await adminAuth.verifyIdToken(match[1]);
    return decoded.uid;
}

function toMillis(value: unknown): number {
    if (!value) return 0;
    if (value instanceof Date) return value.getTime();
    if (typeof value === "string") return new Date(value).getTime();
    if (typeof value === "object" && value !== null && "toDate" in value && typeof value.toDate === "function") {
        return value.toDate().getTime();
    }
    if (typeof value === "object" && value !== null && "seconds" in value && typeof value.seconds === "number") {
        return value.seconds * 1000;
    }
    return 0;
}

function serializeDate(value: unknown): string {
    const millis = toMillis(value);
    return new Date(millis || Date.now()).toISOString();
}

function stripUndefinedDeep<T>(value: T): T {
    if (Array.isArray(value)) {
        return value.map((item) => stripUndefinedDeep(item)) as T;
    }

    if (value && typeof value === "object" && !(value instanceof Date) && !(value instanceof Timestamp)) {
        return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>((record, [key, item]) => {
            if (item !== undefined) {
                record[key] = stripUndefinedDeep(item);
            }
            return record;
        }, {}) as T;
    }

    return value;
}

function mapAttempt(id: string, data: FirebaseFirestore.DocumentData): RawAttempt {
    return {
        id,
        ...data,
        answers: data.answers || [],
        questionOrder: data.questionOrder || [],
        optionOrder: data.optionOrder || {},
    } as RawAttempt;
}

export function serializeAttempt(attempt: RawAttempt): QuizAttemptPayload {
    return {
        ...attempt,
        startedAt: serializeDate(attempt.startedAt),
        completedAt: attempt.completedAt ? serializeDate(attempt.completedAt) : undefined,
        endTime: attempt.endTime ? serializeDate(attempt.endTime) : undefined,
        createdAt: serializeDate(attempt.createdAt),
        updatedAt: serializeDate(attempt.updatedAt),
    };
}

export async function getQuiz(quizId: string): Promise<QuizRecord | null> {
    const snapshot = await adminDb.collection("quizzes").doc(quizId).get();
    if (!snapshot.exists) return null;
    return { id: snapshot.id, ...(snapshot.data() || {}) } as QuizRecord;
}

/**
 * Validate that `userId` is allowed to attempt the contest at `contestId`
 * given any classroom scoping on the contest doc. Throws with a
 * user-readable message when not. No-op for public contests.
 *
 * Shared between the quiz contest path (here) and the test contest path
 * (api/tests/start-attempt) so the rules stay in lockstep.
 */
export async function assertContestClassroomAccess(
    contest: Record<string, unknown>,
    userId: string,
    classId: string | null | undefined
): Promise<void> {
    const teacherId: string = typeof contest.teacherId === "string" ? contest.teacherId : "";
    const instituteId: string =
        typeof contest.instituteId === "string" ? contest.instituteId : "";
    const classIds: string[] = Array.isArray(contest.classIds)
        ? (contest.classIds as string[])
        : [];
    const visibility: string =
        typeof contest.visibility === "string" ? contest.visibility : "";
    const isClassroomScoped =
        (visibility === "private" || visibility === "") && (teacherId || instituteId);
    if (!isClassroomScoped) return;

    const targetClassId = classId || "";
    const candidates =
        targetClassId && (classIds.length === 0 || classIds.includes(targetClassId))
            ? [targetClassId, ...classIds.filter((c) => c !== targetClassId)]
            : classIds;

    for (const cid of candidates) {
        const memberSnap = await adminDb
            .collection("classes")
            .doc(cid)
            .collection("students")
            .doc(userId)
            .get();
        if (!memberSnap.exists) continue;
        if (memberSnap.data()?.status !== "active") continue;
        const classSnap = await adminDb.collection("classes").doc(cid).get();
        if (!classSnap.exists) continue;
        const cls = classSnap.data() || {};
        const ownerOk = teacherId ? cls.teacherId === teacherId : true;
        const instOk = instituteId ? cls.instituteId === instituteId : true;
        if (ownerOk && instOk) return;
    }

    // Legacy fallback: pre-class-refactor enrollments live under
    // teacher_enrollments. Match assertQuizAccess's third path so we
    // don't shut out classrooms still on the old model.
    if (teacherId) {
        const legacySnap = await adminDb
            .collection("teacher_enrollments")
            .doc(teacherId)
            .collection("students")
            .doc(userId)
            .get();
        if (legacySnap.exists && legacySnap.data()?.status === "active") return;
    }

    throw new Error(
        "This contest is private to a classroom. Join the class to participate."
    );
}

export async function getContestAttemptContext(
    contestId: string,
    quizId: string,
    options?: { userId?: string; classId?: string | null }
): Promise<ContestAttemptContext> {
    const snapshot = await adminDb.collection("contests").doc(contestId).get();
    if (!snapshot.exists) throw new Error("Contest not found.");
    const contest = snapshot.data() || {};
    if (contest.status !== "published") throw new Error("Contest is not available.");
    if (contest.sourceType !== "quiz" && contest.sourceType !== "custom") {
        throw new Error("This contest does not use the quiz runner.");
    }
    if (contest.quizId !== quizId) throw new Error("Contest does not match this quiz.");

    const startTime = new Date(toMillis(contest.startTime));
    const endTime = new Date(toMillis(contest.endTime));
    const now = Date.now();
    if (now < startTime.getTime()) throw new Error("This contest has not started yet.");
    if (now >= endTime.getTime()) throw new Error("This contest has already ended.");

    if (options?.userId) {
        await assertContestClassroomAccess(contest, options.userId, options.classId ?? null);
    }

    return {
        contestId,
        title: typeof contest.title === "string" ? contest.title : "Contest",
        startTime,
        endTime,
    };
}

export async function getLinkedCourses(quiz: QuizRecord): Promise<CourseRecord[]> {
    const courseMap = new Map<string, CourseRecord>();

    await Promise.all(
        (quiz.linkedCourseIds || []).map(async (courseId) => {
            const snapshot = await adminDb.collection("courses").doc(courseId).get();
            if (snapshot.exists) {
                courseMap.set(snapshot.id, { id: snapshot.id, ...(snapshot.data() || {}) } as CourseRecord);
            }
        })
    );

    const publishedCourses = await adminDb.collection("courses").where("status", "==", "published").get();
    publishedCourses.docs.forEach((snapshot) => {
        const course = { id: snapshot.id, ...(snapshot.data() || {}) } as CourseRecord;
        const links = course.linkedQuizzes || [];
        const hasQuiz = links.some((link) =>
            link.quizId === quiz.id ||
            link.id === quiz.id ||
            Boolean(quiz.slug && link.url === `/quizzes/${quiz.slug}`)
        );
        if (hasQuiz) courseMap.set(course.id, course);
    });

    return Array.from(courseMap.values()).filter((course) => course.status === "published");
}

export async function assertQuizAccess(
    userId: string,
    quiz: QuizRecord,
    options?: { classId?: string | null }
) {
    if (quiz.status !== "published") {
        return { allowed: false, status: 404, error: "Quiz not found", courses: [] as CourseRecord[] };
    }

    // Institute-authored classroom quizzes: teacherId is empty but
    // instituteId is set. Same access model as teacher classroom quizzes —
    // enrolled students of any assigned class can take it. Without this
    // branch we'd fall through to the course/paywall path below and lock
    // out legitimate students.
    if (!quiz.teacherId && quiz.instituteId) {
        const quizClassIds: string[] = Array.isArray(quiz.classIds) ? quiz.classIds : [];
        const targetClassId = options?.classId || "";
        const candidates = targetClassId && (quizClassIds.length === 0 || quizClassIds.includes(targetClassId))
            ? [targetClassId, ...quizClassIds.filter((c) => c !== targetClassId)]
            : quizClassIds;
        for (const cid of candidates) {
            const memberSnap = await adminDb
                .collection("classes")
                .doc(cid)
                .collection("students")
                .doc(userId)
                .get();
            if (memberSnap.exists && memberSnap.data()?.status === "active") {
                // Lightly verify the class belongs to the same institute as
                // the quiz so a student in an unrelated class can't game
                // the check by passing a stray classId.
                const classSnap = await adminDb.collection("classes").doc(cid).get();
                if (classSnap.exists && classSnap.data()?.instituteId === quiz.instituteId) {
                    return { allowed: true, status: 200, courses: [] as CourseRecord[] };
                }
            }
        }
        return {
            allowed: false,
            status: 403,
            error: "You're not enrolled in any class that has this quiz assigned.",
            courses: [] as CourseRecord[],
        };
    }

    // Teacher classroom quizzes are private to enrolled students unless they
    // have gone through admin approval and were promoted into the public catalog.
    if (quiz.teacherId) {
        if (quiz.visibility === "published" || quiz.visibility === "public") {
            return { allowed: true, status: 200, courses: [] as CourseRecord[] };
        }

        // 1. Class-centric check (current model). When the caller passes the
        //    classId the student arrived through (e.g. from /classroom/[classId])
        //    AND the quiz is assigned to that class, look up the student in
        //    `classes/{classId}/students` directly. This is the right path for
        //    every quiz created in the new class-centric system, including
        //    institute-owned classes (same subcollection shape).
        const targetClassId = options?.classId || "";
        const quizClassIds: string[] = Array.isArray(quiz.classIds) ? quiz.classIds : [];
        if (targetClassId && (quizClassIds.length === 0 || quizClassIds.includes(targetClassId))) {
            const memberSnap = await adminDb
                .collection("classes")
                .doc(targetClassId)
                .collection("students")
                .doc(userId)
                .get();
            if (memberSnap.exists && memberSnap.data()?.status === "active") {
                // Optional: ensure the class actually belongs to the quiz's
                // teacher — otherwise a student in any unrelated class could
                // game the check by passing a random classId.
                const classSnap = await adminDb.collection("classes").doc(targetClassId).get();
                if (classSnap.exists && classSnap.data()?.teacherId === quiz.teacherId) {
                    return { allowed: true, status: 200, courses: [] as CourseRecord[] };
                }
            }
        }

        // 2. Class-fan-out fallback. The student didn't pass a classId (e.g.
        //    they landed on the public quiz URL without a class context), but
        //    they may still be enrolled in some class of this teacher that has
        //    this quiz assigned. Scan the teacher's classes once and check.
        if (quizClassIds.length > 0) {
            for (const cid of quizClassIds) {
                const memberSnap = await adminDb
                    .collection("classes")
                    .doc(cid)
                    .collection("students")
                    .doc(userId)
                    .get();
                if (memberSnap.exists && memberSnap.data()?.status === "active") {
                    return { allowed: true, status: 200, courses: [] as CourseRecord[] };
                }
            }
        }

        // 3. Legacy teacher_enrollments fallback. Pre-class-refactor installs
        //    still have students attached directly to a teacher — honour those
        //    until the migration finishes.
        const enrollmentSnap = await adminDb
            .collection("teacher_enrollments")
            .doc(quiz.teacherId)
            .collection("students")
            .doc(userId)
            .get();
        if (enrollmentSnap.exists && enrollmentSnap.data()?.status === "active") {
            return { allowed: true, status: 200, courses: [] as CourseRecord[] };
        }
        return { allowed: false, status: 403, error: "Join this teacher's classroom to access this quiz.", courses: [] as CourseRecord[] };
    }

    if (quiz.accessType === "free") {
        return { allowed: true, status: 200, courses: [] as CourseRecord[] };
    }

    const courses = await getLinkedCourses(quiz);
    const freeCourse = courses.find((course) => course.accessType === "free");
    if (freeCourse) {
        return { allowed: true, status: 200, courses };
    }

    for (const course of courses) {
        const enrollment = await adminDb.collection("courseEnrollments").doc(`${userId}_${course.id}`).get();
        if (enrollment.exists && enrollment.data()?.status === "active") {
            return { allowed: true, status: 200, courses };
        }
    }

    return { allowed: false, status: 403, error: "Enroll in the linked course to access this quiz.", courses };
}

export async function getRawQuestions(quizId: string): Promise<RawQuizQuestion[]> {
    const snapshot = await adminDb
        .collection("quizzes")
        .doc(quizId)
        .collection("questions")
        .orderBy("order", "asc")
        .get();

    return snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) } as RawQuizQuestion));
}

function hashSeed(value: string): number {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function seededRandom(seed: string) {
    let state = hashSeed(seed) || 1;
    return () => {
        state = Math.imul(1664525, state) + 1013904223;
        return ((state >>> 0) / 4294967296);
    };
}

function stableShuffle<T>(items: T[], seed: string): T[] {
    const result = [...items];
    const random = seededRandom(seed);
    for (let index = result.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(random() * (index + 1));
        [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
}

export function buildQuestionOrder(quiz: QuizRecord, questions: RawQuizQuestion[], attemptId: string) {
    return (quiz.shuffleQuestions ? stableShuffle(questions, `${attemptId}:quiz`) : questions).map((question) => question.id);
}

export function buildOptionOrder(quiz: QuizRecord, questions: RawQuizQuestion[], attemptId: string) {
    const optionOrder: Record<string, string[]> = {};
    questions.forEach((question) => {
        if (!question.options?.length) return;
        const options = quiz.shuffleOptions ? stableShuffle(question.options, `${attemptId}:${question.id}:options`) : question.options;
        optionOrder[question.id] = options.map((option) => option.id);
    });
    return optionOrder;
}

export function sanitizeQuestions(questions: RawQuizQuestion[], attempt: RawAttempt): SanitizedQuizQuestion[] {
    const byId = new Map(questions.map((question) => [question.id, question]));
    const orderedIds = attempt.questionOrder?.length ? attempt.questionOrder : questions.map((question) => question.id);

    return orderedIds
        .map((id) => byId.get(id))
        .filter(Boolean)
        .map((question) => {
            const optionIds = attempt.optionOrder?.[question!.id] || question!.options?.map((option) => option.id) || [];
            const optionsById = new Map((question!.options || []).map((option) => [option.id, option]));
            return {
                id: question!.id,
                quizId: question!.quizId,
                type: question!.type,
                questionText: question!.questionText,
                options: question!.type === "mcq"
                    ? optionIds
                        .map((id) => optionsById.get(id))
                        .filter(Boolean)
                        .map((option) => ({ id: option!.id, text: option!.text }))
                    : undefined,
                marks: Number(question!.marks || 0),
                negativeMarks: Number(question!.negativeMarks || 0),
                difficulty: question!.difficulty || "medium",
                order: Number(question!.order || 0),
                passageGroup: question!.passageGroup,
                passage: question!.passage,
            };
        });
}

export function normalizeAnswer(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function answersToRecord(answers: Array<{ questionId: string; answer: string }>) {
    return answers.reduce<Record<string, string>>((record, answer) => {
        record[answer.questionId] = answer.answer || "";
        return record;
    }, {});
}

export function evaluateQuiz(quiz: QuizRecord, questions: RawQuizQuestion[], answers: Array<{ questionId: string; answer: string; timeSpent?: number }>) {
    const answerRecord = answersToRecord(answers);
    let totalScore = 0;
    let correctAnswers = 0;
    let wrongAnswers = 0;
    let skipped = 0;

    const questionResults: QuestionResult[] = questions.map((question) => {
        const selectedAnswer = answerRecord[question.id] || "";
        const marks = Number(question.marks || 0);
        const negativeMarks = Number(question.negativeMarks || 0);
        const correctOptionIds = (question.options || [])
            .filter((option) => option.isCorrect)
            .map((option) => option.id);
        const baseResult = {
            questionId: question.id,
            selectedAnswer,
            correctOptionIds,
            questionMarks: marks,
            negativeMarks,
            ...(question.type === "text_input" ? { correctAnswer: question.correctAnswer || "" } : {}),
            ...(question.explanation ? { explanation: question.explanation } : {}),
        };

        if (!selectedAnswer) {
            skipped += 1;
            return {
                ...baseResult,
                status: "skipped",
                earnedMarks: 0,
            };
        }

        const isCorrect = question.type === "mcq"
            ? correctOptionIds.includes(selectedAnswer)
            : normalizeAnswer(selectedAnswer) === normalizeAnswer(question.correctAnswer || "");

        if (isCorrect) {
            correctAnswers += 1;
            totalScore += marks;
        } else {
            wrongAnswers += 1;
            totalScore -= negativeMarks;
        }

        return {
            ...baseResult,
            status: isCorrect ? "correct" : "wrong",
            earnedMarks: isCorrect ? marks : -negativeMarks,
        };
    });

    const maxPossibleScore = questions.reduce((total, question) => total + Number(question.marks || 0), 0);
    const finalScore = Math.max(0, Math.round(totalScore * 100) / 100);
    const percentage = maxPossibleScore > 0 ? Math.round((finalScore / maxPossibleScore) * 100) : 0;
    const passingPercentage = Number(quiz.passingPercentage || 0);

    return {
        totalScore: finalScore,
        rawScore: Math.round(totalScore * 100) / 100,
        maxPossibleScore,
        correctAnswers,
        wrongAnswers,
        skipped,
        percentage,
        passed: passingPercentage > 0 ? percentage >= passingPercentage : null,
        passingPercentage,
        questionResults,
    };
}

export async function getAttempt(attemptId: string): Promise<RawAttempt | null> {
    const snapshot = await adminDb.collection("quizAttempts").doc(attemptId).get();
    if (!snapshot.exists) return null;
    return mapAttempt(snapshot.id, snapshot.data() || {});
}

export async function getUserQuizAttempts(userId: string, quizId: string): Promise<RawAttempt[]> {
    const snapshot = await adminDb.collection("quizAttempts").where("userId", "==", userId).get();
    return snapshot.docs
        .map((doc) => mapAttempt(doc.id, doc.data()))
        .filter((attempt) => attempt.quizId === quizId)
        .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
}

export async function finalizeAttempt(attemptId: string, finalStatus: "completed" | "timed_out" = "completed"): Promise<RawAttempt> {
    const attemptRef = adminDb.collection("quizAttempts").doc(attemptId);

    return adminDb.runTransaction(async (tx) => {
        const attemptSnapshot = await tx.get(attemptRef);
        if (!attemptSnapshot.exists) throw new Error("Quiz attempt not found.");

        const attempt = mapAttempt(attemptSnapshot.id, attemptSnapshot.data() || {});
        if (attempt.status !== "in_progress") return attempt;

        const [quiz, questions] = await Promise.all([
            getQuiz(attempt.quizId),
            getRawQuestions(attempt.quizId),
        ]);
        if (!quiz) throw new Error("Quiz not found.");

        const evaluation = evaluateQuiz(quiz, questions, attempt.answers || []);
        const now = Timestamp.now();
        const totalTimeSpent = Math.max(0, Math.floor((now.toMillis() - (toMillis(attempt.startedAt) || now.toMillis())) / 1000));
        const remainingTime = attempt.endTime ? Math.max(0, Math.floor((toMillis(attempt.endTime) - now.toMillis()) / 1000)) : undefined;

        const evaluatedAnswers = (attempt.answers || []).map((answer) => {
            const result = evaluation.questionResults.find((item) => item.questionId === answer.questionId);
            return {
                ...answer,
                isCorrect: result?.status === "correct",
                marksObtained: result?.earnedMarks || 0,
            };
        });

        const updateData = {
            status: finalStatus,
            completedAt: now,
            answers: evaluatedAnswers,
            totalScore: evaluation.totalScore,
            maxPossibleScore: evaluation.maxPossibleScore,
            correctAnswers: evaluation.correctAnswers,
            wrongAnswers: evaluation.wrongAnswers,
            skipped: evaluation.skipped,
            percentage: evaluation.percentage,
            passed: evaluation.passed,
            passingPercentage: evaluation.passingPercentage,
            questionResults: evaluation.questionResults,
            totalTimeSpent,
            remainingTime,
            updatedAt: now,
        };

        tx.update(attemptRef, stripUndefinedDeep(updateData));
        return { ...attempt, ...updateData } as unknown as RawAttempt;
    });
}

export async function syncTimedOutAttempt(attempt: RawAttempt): Promise<RawAttempt> {
    if (attempt.status !== "in_progress" || !attempt.endTime) return attempt;
    if (toMillis(attempt.endTime) > Date.now()) return attempt;
    return finalizeAttempt(attempt.id, "timed_out");
}

export async function createQuizAttempt(
    userId: string,
    quiz: QuizRecord,
    contestContext?: ContestAttemptContext,
    options?: { classId?: string | null }
): Promise<RawAttempt> {
    // Tag attempts from non-customer roles (teachers, institute admins,
    // platform admins) as preview attempts so they're excluded from
    // public leaderboards and class analytics downstream.
    const previewOverlay = await previewAttemptOverlay(userId);
    // Pre-check (outside the transaction) for completed contest submissions so
    // we can fail fast with a clean 4xx.
    const allAttempts = await getUserQuizAttempts(userId, quiz.id);
    if (
        contestContext &&
        allAttempts.some(
            (attempt) =>
                attempt.contestId === contestContext.contestId &&
                (attempt.status === "completed" || attempt.status === "timed_out")
        )
    ) {
        throw new Error("You have already submitted this contest.");
    }

    // If a non-stale in-progress attempt already exists outside the transaction,
    // return it directly to avoid the unnecessary write path.
    const existingActive = allAttempts.find(
        (attempt) =>
            attempt.status === "in_progress" &&
            (contestContext ? attempt.contestId === contestContext.contestId : !attempt.contestId)
    );
    if (existingActive) {
        const synced = await syncTimedOutAttempt(existingActive);
        if (synced.status === "in_progress") return synced;
    }

    const questions = await getRawQuestions(quiz.id);
    const attemptsCollection = adminDb.collection("quizAttempts");
    const attemptId = uuidv4();
    const maxPossibleScore = questions.reduce(
        (total, question) => total + Number(question.marks || 0),
        0
    );

    // Race-safe create: re-query inside a transaction so two parallel calls
    // both observe the same state and only one writes a new attempt.
    const result = await adminDb.runTransaction(async (tx) => {
        const activeQuery = contestContext
            ? attemptsCollection
                  .where("userId", "==", userId)
                  .where("contestId", "==", contestContext.contestId)
                  .where("status", "==", "in_progress")
                  .limit(1)
            : attemptsCollection
                  .where("userId", "==", userId)
                  .where("quizId", "==", quiz.id)
                  .where("status", "==", "in_progress")
                  .limit(1);
        const existingSnap = await tx.get(activeQuery);
        const existingDoc = existingSnap.docs.find((d) => {
            const data = d.data() || {};
            if (data.quizId !== quiz.id) return false;
            if (!contestContext && data.contestId) return false;
            return true;
        });
        if (existingDoc) {
            return mapAttempt(existingDoc.id, existingDoc.data() || {});
        }

        const now = Timestamp.now();
        const durationInSeconds = contestContext
            ? Math.max(
                  0,
                  Math.floor((contestContext.endTime.getTime() - now.toMillis()) / 1000)
              )
            : Number(quiz.timeLimitMinutes || 0) > 0
            ? Number(quiz.timeLimitMinutes || 0) * 60
            : undefined;
        if (contestContext && (!durationInSeconds || durationInSeconds <= 0)) {
            throw new Error("This contest has already ended.");
        }
        const endTime = contestContext
            ? Timestamp.fromDate(contestContext.endTime)
            : durationInSeconds
            ? Timestamp.fromMillis(now.toMillis() + durationInSeconds * 1000)
            : undefined;

        // Stamp the class the student arrived through (validated upstream
        // in assertQuizAccess / getContestAttemptContext) so teacher
        // dashboards can group attempts by classroom. Null when the quiz
        // was opened outside a class context.
        const classId =
            typeof options?.classId === "string" && options.classId ? options.classId : null;

        const attemptData = {
            userId,
            quizId: quiz.id,
            ...(classId ? { classId } : {}),
            ...(contestContext
                ? {
                      contestId: contestContext.contestId,
                      sourceType: "contest",
                      contestTitle: contestContext.title,
                  }
                : {
                      sourceType: "quiz",
                  }),
            title: `Attempt ${allAttempts.length + 1}`,
            attemptNumber: allAttempts.length + 1,
            status: "in_progress",
            startedAt: now,
            endTime,
            currentQuestionIndex: 0,
            answers: [],
            questionOrder: buildQuestionOrder(quiz, questions, attemptId),
            optionOrder: buildOptionOrder(quiz, questions, attemptId),
            totalScore: 0,
            maxPossibleScore,
            correctAnswers: 0,
            wrongAnswers: 0,
            skipped: questions.length,
            percentage: 0,
            passed: null,
            passingPercentage: Number(quiz.passingPercentage || 0),
            totalTimeSpent: 0,
            remainingTime: durationInSeconds,
            createdAt: now,
            updatedAt: now,
            ...(previewOverlay || {}),
        };
        const newRef = attemptsCollection.doc(attemptId);
        tx.set(newRef, stripUndefinedDeep(attemptData));
        return { id: attemptId, ...attemptData } as unknown as RawAttempt;
    });

    // Mirror the attempt id onto the user doc (best-effort, outside the txn).
    await adminDb
        .collection("users")
        .doc(userId)
        .set(
            {
                quizAttemptIds: FieldValue.arrayUnion(result.id),
                updatedAt: Timestamp.now(),
            },
            { merge: true }
        )
        .catch(() => {
            /* mirror is non-critical */
        });

    return result;
}

export function buildAttemptResponse(attempt: RawAttempt, questions: RawQuizQuestion[]) {
    return {
        attempt: serializeAttempt(attempt),
        questions: attempt.status === "in_progress" ? sanitizeQuestions(questions, attempt) : [],
    };
}
