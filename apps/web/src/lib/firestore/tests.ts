"use client";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  arrayUnion,
  runTransaction,
  writeBatch,
  type DocumentData,
} from "firebase/firestore";
import { auth, db } from "../firebase/client";
import type {
  TestSeries,
  Test,
  Question,
  TestAttempt,
  TestPurchase,
  TestAnswerInput,
  CreateTestInput,
  UpdateTestInput,
  CreateQuestionInput,
  UpdateQuestionInput,
  TestSectionInput,
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

function sanitizeData(data: any): any {
  if (data === null || data === undefined) return data;

  // Preserve Dates and Timestamps
  if (
    data instanceof Date ||
    (data.seconds !== undefined && data.nanoseconds !== undefined)
  ) {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(sanitizeData);
  }

  if (typeof data === "object") {
    const result: any = {};
    for (const key in data) {
      if (data[key] !== undefined) {
        result[key] = sanitizeData(data[key]);
      }
    }
    return result;
  }

  return data;
}

function normalizeSections(sections?: TestSectionInput[]): Test["sections"] {
  if (!sections) return undefined;

  return sections
    .map((section, index) => ({
      id: section.id || uuidv4(),
      title: section.title.trim(),
      description: section.description?.trim() || "",
      order: section.order ?? index,
      marksPerQuestion:
        typeof section.marksPerQuestion === "number"
          ? section.marksPerQuestion
          : undefined,
      negativeMarks:
        typeof section.negativeMarks === "number"
          ? section.negativeMarks
          : undefined,
      cutoffMarks:
        typeof section.cutoffMarks === "number"
          ? section.cutoffMarks
          : undefined,
    }))
    .filter((section) => section.title)
    .sort((a, b) => a.order - b.order)
    .map((section, index) => ({ ...section, order: index }));
}

function getSectionForQuestion(test: Test | null, question: Question) {
  return (
    (test?.sections || []).find(
      (section) => section.id === question.sectionId
    ) || null
  );
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

function getMaxPossibleScore(
  test: Test | null,
  questions: Question[],
  fallback: number
): number {
  const maxScore = questions.reduce(
    (sum, question) => sum + getQuestionScoring(test, question).marks,
    0
  );
  return maxScore > 0 ? Math.round(maxScore * 100) / 100 : fallback;
}

// --- Test Series (Public) ---

function isPublicCatalogTestSeries(
  series: TestSeries & { teacherId?: string; visibility?: string }
): boolean {
  // Admin-authored content: no teacherId, just needs status published
  if (!series.teacherId && series.status === "published") return true;
  // Teacher-authored content: must have admin-approved visibility
  if (series.teacherId && series.visibility === "published") return true;
  return false;
}

// We can't query `where("teacherId", "==", "") OR where("visibility", "in", [...])`
// in a single Firestore query without an OR composite, so we run two queries in
// parallel and merge the results. This is the price for keeping the rule strict
// enough to reject classroom-only content from public reads.
function reviveCatalogSeries(raw: any): TestSeries {
  const toDate = (val: any) => {
    if (!val) return undefined;
    if (val instanceof Date) return val;
    if (typeof val === "string") return new Date(val);
    if (typeof val.toDate === "function") return val.toDate();
    return undefined;
  };
  return {
    ...raw,
    createdAt: toDate(raw.createdAt) || new Date(),
    updatedAt: toDate(raw.updatedAt) || new Date(),
  } as TestSeries;
}

async function fetchCatalogJson<T = any>(path: string): Promise<T | null> {
  try {
    if (typeof window === "undefined") {
      // Server-side render: skip the catalog API hop. The page can show the
      // skeleton; the client will re-fetch on hydration.
      return null;
    }
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function getPublishedTestSeries(filters?: {
  category?: string;
}): Promise<TestSeries[]> {
  // Always go through the server catalog API. The admin SDK behind it bypasses
  // Firestore rules and the field-presence quirks that broke listing queries
  // before, and gives us a single source of truth for "what's publicly
  // browsable".
  const params = new URLSearchParams();
  if (filters?.category) params.set("category", filters.category);
  const query = params.toString() ? `?${params.toString()}` : "";
  const payload = await fetchCatalogJson<{ items: any[] }>(`/api/catalog/tests${query}`);
  if (!payload || !Array.isArray(payload.items)) return [];
  return payload.items.map(reviveCatalogSeries);
}

// Backward compatibility
export const getPublishedTests = getPublishedTestSeries;

export async function getTestSeriesBySlug(
  slug: string
): Promise<TestSeries | null> {
  // Prefer the server catalog API so the rule + index dance never blocks a
  // public student from opening an admin-published series. Falls back to a
  // direct Firestore read on the server.
  const payload = await fetchCatalogJson<{ series: any }>(`/api/catalog/tests?slug=${encodeURIComponent(slug)}`);
  if (payload && payload.series) {
    return reviveCatalogSeries(payload.series);
  }

  const docRef = doc(testsCollection, slug);
  try {
    const snapshot = await getDoc(docRef);
    if (snapshot.exists()) {
      const series = mapDoc<TestSeries & { teacherId?: string; visibility?: string }>(snapshot);
      return isPublicCatalogTestSeries(series) ? series : null;
    }
  } catch {
    // If the route slug is not the document ID, Firestore can deny the
    // direct document read before the slug query below has a chance to run.
  }

  const slugQuery = query(
    testsCollection,
    where("slug", "==", slug),
    where("status", "==", "published"),
    limit(1)
  );
  const slugSnapshot = await getDocs(slugQuery);
  if (slugSnapshot.empty) return null;

  const series = mapDoc<TestSeries & { teacherId?: string; visibility?: string }>(slugSnapshot.docs[0]);
  return isPublicCatalogTestSeries(series) ? series : null;
}

// Backward compatibility
export const getTestBySlug = getTestSeriesBySlug;
export const getTestSeries = getTestSeriesBySlug;

export async function getTeacherTestSeries(
  seriesId: string
): Promise<TestSeries | null> {
  const docRef = doc(testsCollection, seriesId);
  const snapshot = await getDoc(docRef);
  if (!snapshot.exists()) return null;
  return mapDoc<TestSeries>(snapshot);
}

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

export async function getTestById(
  seriesId: string,
  testId: string
): Promise<Test | null> {
  const testRef = doc(db, "tests", seriesId, "tests", testId);
  const snapshot = await getDoc(testRef);
  if (!snapshot.exists()) return null;
  return mapDoc<Test>(snapshot);
}

// --- Questions ---

export async function getTestQuestions(
  seriesId: string,
  testId: string
): Promise<Question[]> {
  const questionsCollection = collection(
    db,
    "tests",
    seriesId,
    "tests",
    testId,
    "questions"
  );
  const q = query(questionsCollection, orderBy("order", "asc"));
  const snapshot = await getDocs(q);
  return mapDocs<Question>(snapshot);
}

// --- Test Purchases ---

export async function getUserTestPurchases(
  userId: string
): Promise<TestPurchase[]> {
  const q = query(testPurchasesCollection, where("userId", "==", userId));
  const snapshot = await getDocs(q);
  return mapDocs<TestPurchase>(snapshot).sort(
    (a, b) => b.purchasedAt.getTime() - a.purchasedAt.getTime()
  );
}

export async function hasUserPurchasedTest(
  userId: string,
  seriesId: string
): Promise<boolean> {
  const q = query(testPurchasesCollection, where("userId", "==", userId));
  const snapshot = await getDocs(q);
  return mapDocs<TestPurchase>(snapshot).some(
    (purchase) => purchase.seriesId === seriesId && purchase.status === "active"
  );
}

export async function getTestPurchaseByOrderId(
  orderId: string
): Promise<TestPurchase | null> {
  const q = query(
    testPurchasesCollection,
    where("orderId", "==", orderId),
    limit(1)
  );
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  return mapDoc<TestPurchase>(snapshot.docs[0]);
}

// --- Test Attempts ---

function toMillis(value: Date | undefined): number {
  return value?.getTime?.() ?? 0;
}

function getAttemptStartMillis(attempt: TestAttempt): number {
  return (
    toMillis(attempt.startedAt) ||
    toMillis(attempt.createdAt) ||
    toMillis(attempt.updatedAt)
  );
}

function getAttemptFinalizedMillis(attempt: TestAttempt): number {
  return (
    toMillis(attempt.completedAt) ||
    toMillis(attempt.updatedAt) ||
    toMillis(attempt.createdAt)
  );
}

function isFinalizedAttempt(attempt: TestAttempt): boolean {
  return attempt.status === "completed" || attempt.status === "timed_out";
}

function normalizeAttemptAnswersForSubmit(
  attempt: TestAttempt
): TestAnswerInput[] {
  return (attempt.answers || [])
    .map((answer: any) => ({
      questionId: answer.questionId,
      selectedOptionId: answer.selectedOptionId ?? answer.answer ?? "",
      timeSpent: answer.timeSpent ?? 0,
    }))
    .filter((answer) => answer.questionId);
}

export function isTestAttemptResumable(
  attempt: TestAttempt,
  allAttempts: TestAttempt[]
): boolean {
  if (attempt.status !== "in_progress") return false;
  if ((attempt.remainingTime ?? 1) <= 0) return false;

  const startedAt = getAttemptStartMillis(attempt);
  return !allAttempts.some((other) => {
    if (other.id === attempt.id) return false;
    if (other.userId !== attempt.userId) return false;
    const sameAttemptContext = attempt.contestId
      ? other.contestId === attempt.contestId
      : other.testId === attempt.testId && !other.contestId;
    if (!sameAttemptContext) return false;
    if (!isFinalizedAttempt(other)) return false;
    return getAttemptFinalizedMillis(other) >= startedAt;
  });
}

export function getResumableAttemptsFromList(
  attempts: TestAttempt[]
): TestAttempt[] {
  return attempts.filter((attempt) =>
    isTestAttemptResumable(attempt, attempts)
  );
}

/**
 * Sync remaining time and auto-submit expired in-progress attempts.
 * Returns true if the attempt was timed out.
 */
async function syncAndTimeoutAttempt(attempt: TestAttempt): Promise<boolean> {
  if (attempt.status !== "in_progress") return false;

  let endTime = attempt.endTime;
  if (!endTime && attempt.updatedAt && attempt.remainingTime) {
    endTime = new Date(
      attempt.updatedAt.getTime() + attempt.remainingTime * 1000
    );
  }

  if (!endTime) return false;

  const now = new Date();
  const remaining = Math.max(
    0,
    Math.floor((endTime.getTime() - now.getTime()) / 1000)
  );
  attempt.remainingTime = remaining;

  if (remaining <= 0) {
    // Auto-submit using the latest saved answers so a timer expiry does
    // not wipe progress that was already autosaved.
    try {
      await submitTestAttempt(attempt.id, {
        answers: normalizeAttemptAnswersForSubmit(attempt),
        remainingTime: 0,
        finalStatus: "timed_out",
      });
      attempt.status = "timed_out";
      attempt.remainingTime = 0;
    } catch {
      // If submit fails (e.g. already completed), just mark locally
      attempt.status = "timed_out";
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
  deviceInfo?: { ip?: string; userAgent?: string },
  contestContext?: {
    contestId: string;
    title: string;
    startTime: Date;
    endTime: Date;
  }
): Promise<TestAttempt> {
  const isContestAttempt = Boolean(contestContext);
  // Keep these queries simple to avoid composite-index failures on first deploy.
  const activeAttemptsQuery = query(
    testAttemptsCollection,
    where("userId", "==", userId)
  );
  const activeAttemptsSnapshot = await getDocs(activeAttemptsQuery);
  const userAttempts = mapDocs<TestAttempt>(activeAttemptsSnapshot);
  const previousTestAttempts = userAttempts.filter((attempt) => {
    if (isContestAttempt)
      return attempt.contestId === contestContext!.contestId;
    return attempt.testId === testId && !attempt.contestId;
  });
  const activeAttempts = userAttempts
    .filter((attempt) => attempt.status === "in_progress")
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  if (contestContext) {
    const nowDate = new Date();
    if (nowDate < contestContext.startTime) {
      throw new Error("This contest has not started yet.");
    }
    if (nowDate >= contestContext.endTime) {
      throw new Error("This contest has already ended.");
    }
    if (
      previousTestAttempts.some(
        (attempt) =>
          attempt.status === "completed" || attempt.status === "timed_out"
      )
    ) {
      throw new Error("You have already submitted this contest.");
    }
  }

  // 1. Check for an existing in-progress attempt for THIS SPECIFIC context
  const existingThisTest = activeAttempts.find((attempt) =>
    isContestAttempt
      ? attempt.contestId === contestContext!.contestId
      : attempt.testId === testId && !attempt.contestId
  );
  if (existingThisTest) {
    const attempt = existingThisTest;
    const wasTimedOut = await syncAndTimeoutAttempt(attempt);
    if (!wasTimedOut) {
      if (isTestAttemptResumable(attempt, userAttempts)) {
        return attempt;
      }
      await abandonTestAttempt(attempt.id).catch((error) => {
        console.warn("Failed to abandon stale same-test attempt:", error);
      });
      attempt.status = "abandoned";
    }
    // If timed out, fall through to create a new attempt
  }

  // 2. Check for ANY other in-progress attempt globally (enforce single active test)
  const otherActiveAttempt = activeAttempts.find((attempt) =>
    isContestAttempt
      ? attempt.contestId !== contestContext!.contestId
      : attempt.testId !== testId || Boolean(attempt.contestId)
  );
  if (otherActiveAttempt) {
    const otherAttempt = otherActiveAttempt;
    const wasTimedOut = await syncAndTimeoutAttempt(otherAttempt);
    if (!wasTimedOut) {
      if (!isTestAttemptResumable(otherAttempt, userAttempts)) {
        await abandonTestAttempt(otherAttempt.id).catch((error) => {
          console.warn("Failed to abandon stale active attempt:", error);
        });
        otherAttempt.status = "abandoned";
      } else {
        // Another test is still active and not timed out
        throw new Error(
          `You already have an active test: "${otherAttempt.title}". Please finish or submit it before starting a new one.`
        );
      }
    }
    // If timed out, we can proceed to create a new attempt
  }

  // 3. Count previous attempts for this specific test to name the new one
  const attemptNumber = previousTestAttempts.length + 1;

  const attemptId = uuidv4();
  const test = await getTestById(seriesId, testId);
  if (!test) throw new Error("Test not found");
  const questions = await getTestQuestions(seriesId, testId);
  const maxPossibleScore = getMaxPossibleScore(
    test,
    questions,
    test.totalMarks
  );

  if (
    !test.allowRetake &&
    previousTestAttempts.some(
      (attempt) =>
        attempt.status === "completed" || attempt.status === "timed_out"
    )
  ) {
    throw new Error("Retakes are disabled for this test.");
  }

  const now = Timestamp.now();
  const durationInSeconds = contestContext
    ? Math.max(
        0,
        Math.floor(
          (contestContext.endTime.getTime() - now.toDate().getTime()) / 1000
        )
      )
    : test.duration * 60;
  if (durationInSeconds <= 0) {
    throw new Error("This contest has already ended.");
  }
  const endTime = contestContext
    ? contestContext.endTime
    : new Date(now.toDate().getTime() + durationInSeconds * 1000);

  const attemptData: any = {
    userId,
    seriesId,
    testId,
    ...(contestContext
      ? {
          contestId: contestContext.contestId,
          sourceType: "contest",
          contestTitle: contestContext.title,
        }
      : {
          sourceType: "test_series",
        }),
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

export async function getTestAttempt(
  attemptId: string
): Promise<TestAttempt | null> {
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
export async function getLatestAttemptsForTest(
  testId: string
): Promise<TestAttempt[]> {
  const q = query(testAttemptsCollection, where("testId", "==", testId));
  const snapshot = await getDocs(q);
  const attempts = mapDocs<TestAttempt>(snapshot).filter(
    (a) => a.status === "completed" || a.status === "timed_out"
  );

  // Keep only the latest completed attempt per user
  const latestByUser = new Map<string, TestAttempt>();
  for (const attempt of attempts) {
    const existing = latestByUser.get(attempt.userId);
    const completedAt =
      attempt.completedAt?.getTime?.() ?? attempt.updatedAt?.getTime?.() ?? 0;
    const existingCompletedAt =
      existing?.completedAt?.getTime?.() ??
      existing?.updatedAt?.getTime?.() ??
      0;
    if (!existing || completedAt > existingCompletedAt) {
      latestByUser.set(attempt.userId, attempt);
    }
  }
  return Array.from(latestByUser.values());
}

export async function getUserTestAttempts(
  userId: string,
  seriesId?: string,
  testId?: string
): Promise<TestAttempt[]> {
  const q = query(testAttemptsCollection, where("userId", "==", userId));

  const snapshot = await getDocs(q);
  const attempts = mapDocs<TestAttempt>(snapshot)
    .filter((attempt) => !seriesId || attempt.seriesId === seriesId)
    .filter((attempt) => !testId || attempt.testId === testId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  // Sync time and auto-submit expired in-progress attempts
  for (const attempt of attempts) {
    if (attempt.status === "in_progress") {
      await syncAndTimeoutAttempt(attempt);
    }
  }

  return attempts;
}

export async function getResumableTestAttempts(
  userId: string,
  seriesId?: string
): Promise<TestAttempt[]> {
  const attempts = await getUserTestAttempts(userId, seriesId);
  const staleInProgress = attempts.filter(
    (attempt) =>
      attempt.status === "in_progress" &&
      !isTestAttemptResumable(attempt, attempts)
  );

  // Best-effort cleanup: if a completed/timed_out attempt already exists for
  // the same test after this in-progress one started, the in-progress doc is
  // an orphan from a race or interrupted submit and should not keep showing.
  await Promise.all(
    staleInProgress.map((attempt) =>
      abandonTestAttempt(attempt.id).catch((error) => {
        console.warn("Failed to abandon stale in-progress attempt:", error);
      })
    )
  );

  return getResumableAttemptsFromList(attempts);
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
    updateData.answers = data.answers.map((a) => ({
      questionId: a.questionId,
      answer: a.selectedOptionId,
      timeSpent: a.timeSpent,
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

// --- Teacher Test Series Management ---

export async function getTeacherTestsInSeries(
  seriesId: string
): Promise<Test[]> {
  const seriesRef = doc(testsCollection, seriesId);
  const testsSubCollection = collection(seriesRef, "tests");
  const q = query(testsSubCollection, orderBy("order", "asc"));
  const snapshot = await getDocs(q);
  return mapDocs<Test>(snapshot);
}

export async function createTeacherTestInSeries(
  data: CreateTestInput
): Promise<string> {
  const testId = uuidv4();
  const testRef = doc(testsCollection, data.seriesId, "tests", testId);
  const now = Timestamp.now();
  const seriesDoc = await getDoc(doc(testsCollection, data.seriesId));
  const series = seriesDoc.exists() ? mapDoc<TestSeries>(seriesDoc) : null;

  const testData: Omit<Test, "id"> = {
    ...data,
    description: data.description || "",
    status: data.status || "draft",
    order: data.order || 0,
    totalQuestions: 0,
    sections: normalizeSections(data.sections) || [],
    instantResults: data.instantResults ?? series?.instantResults ?? true,
    allowRetake: data.allowRetake ?? series?.allowRetake ?? false,
    shuffleQuestions:
      data.shuffleQuestions ?? series?.shuffleQuestions ?? false,
    shuffleOptions: data.shuffleOptions ?? series?.shuffleOptions ?? false,
    createdAt: now.toDate(),
    updatedAt: now.toDate(),
  };

  await setDoc(testRef, sanitizeData(testData));

  // Update total tests in series
  const seriesRef = doc(testsCollection, data.seriesId);
  const tests = await getTeacherTestsInSeries(data.seriesId);
  await updateDoc(seriesRef, { totalTests: tests.length });

  return testId;
}

export async function updateTeacherTestInSeries(
  data: UpdateTestInput
): Promise<void> {
  const { id, seriesId, ...updateData } = data;
  const testRef = doc(testsCollection, seriesId, "tests", id);

  const updatePayload = {
    ...updateData,
    sections: data.sections ? normalizeSections(data.sections) : undefined,
    updatedAt: Timestamp.now(),
  };

  await updateDoc(testRef, sanitizeData(updatePayload));
}

export async function deleteTeacherTestInSeries(
  seriesId: string,
  testId: string
): Promise<void> {
  const testRef = doc(testsCollection, seriesId, "tests", testId);

  // Delete questions first
  const questionsSubCollection = collection(testRef, "questions");
  const questionsSnapshot = await getDocs(questionsSubCollection);
  const batch = writeBatch(db);
  questionsSnapshot.docs.forEach((q) => batch.delete(q.ref));
  batch.delete(testRef);
  await batch.commit();

  // Update stats
  const seriesRef = doc(testsCollection, seriesId);
  const tests = await getTeacherTestsInSeries(seriesId);
  await updateDoc(seriesRef, { totalTests: tests.length });
}

export async function getTeacherTestQuestions(
  seriesId: string,
  testId: string
): Promise<Question[]> {
  const questionsCollection = collection(
    db,
    "tests",
    seriesId,
    "tests",
    testId,
    "questions"
  );
  const q = query(questionsCollection, orderBy("order", "asc"));
  const snapshot = await getDocs(q);
  return mapDocs<Question>(snapshot);
}

export async function createTeacherTestQuestion(
  data: CreateQuestionInput
): Promise<string> {
  const questionId = uuidv4();
  const questionRef = doc(
    db,
    "tests",
    data.seriesId,
    "tests",
    data.testId,
    "questions",
    questionId
  );
  const now = Timestamp.now();

  let options = data.options;
  if (data.type === "mcq" && options) {
    options = options.map((opt) => ({
      ...opt,
      id: (opt as any).id || uuidv4(),
    }));
  }

  const questionData: Omit<Question, "id"> = {
    ...data,
    options: options as any,
    negativeMarks: data.negativeMarks || 0,
    difficulty: data.difficulty || "medium",
    order: data.order || 0,
    createdAt: now.toDate(),
    updatedAt: now.toDate(),
  };

  await setDoc(questionRef, sanitizeData(questionData));

  // Update question counts
  const testQuestions = await getTeacherTestQuestions(
    data.seriesId,
    data.testId
  );
  const testRef = doc(db, "tests", data.seriesId, "tests", data.testId);
  await updateDoc(testRef, { totalQuestions: testQuestions.length });

  // Update series total questions
  const seriesRef = doc(db, "tests", data.seriesId);
  const allTests = await getTeacherTestsInSeries(data.seriesId);
  const totalSeriesQuestions = allTests.reduce(
    (acc, t) => acc + (t.totalQuestions || 0),
    0
  );
  await updateDoc(seriesRef, { totalQuestions: totalSeriesQuestions });

  return questionId;
}

export async function updateTeacherTestQuestion(
  data: UpdateQuestionInput
): Promise<void> {
  const { id, seriesId, testId, ...updateData } = data;
  const questionRef = doc(
    db,
    "tests",
    seriesId,
    "tests",
    testId,
    "questions",
    id
  );

  let options = updateData.options;
  if (updateData.type === "mcq" && options) {
    options = options.map((opt) => ({
      ...opt,
      id: (opt as any).id || uuidv4(),
    }));
  }

  const updatePayload = {
    ...updateData,
    options,
    updatedAt: Timestamp.now(),
  };

  await updateDoc(questionRef, sanitizeData(updatePayload));
}

export async function deleteTeacherTestQuestion(
  seriesId: string,
  testId: string,
  questionId: string
): Promise<void> {
  const questionRef = doc(
    db,
    "tests",
    seriesId,
    "tests",
    testId,
    "questions",
    questionId
  );
  await deleteDoc(questionRef);

  // Update question counts
  const testQuestions = await getTeacherTestQuestions(seriesId, testId);
  const testRef = doc(db, "tests", seriesId, "tests", testId);
  await updateDoc(testRef, { totalQuestions: testQuestions.length });

  // Update series total questions
  const seriesRef = doc(db, "tests", seriesId);
  const allTests = await getTeacherTestsInSeries(seriesId);
  const totalSeriesQuestions = allTests.reduce(
    (acc, t) => acc + (t.totalQuestions || 0),
    0
  );
  await updateDoc(seriesRef, { totalQuestions: totalSeriesQuestions });
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

const PISTON_LANGUAGE_MAP: Record<
  string,
  { language: string; version: string }
> = {
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
  if (url.includes("piston") || url.endsWith("/api/v2/execute"))
    return "piston";
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
    return {
      stdout: "",
      stderr: `Unsupported language: ${language}`,
      exitCode: 1,
    };
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
    const fullStderr = compileError
      ? `[Compile Error]:\n${compileError}\n\n${stderr}`
      : stderr;

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
    return {
      stdout: "",
      stderr: `Unsupported language: ${language}`,
      exitCode: 1,
    };
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

    const fullStderr = compileOutput
      ? `[Compile Error]:\n${compileOutput}\n\n${stderr}`
      : stderr;

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
    /** Proctoring signals captured during the attempt (best-effort). */
    integrity?: { tabSwitches?: number; autoSubmitted?: boolean };
  }
): Promise<TestAttempt> {
  const attemptRef = doc(testAttemptsCollection, attemptId);
  const attemptSnapshot = await getDoc(attemptRef);
  const attempt = attemptSnapshot.exists()
    ? mapDoc<TestAttempt>(attemptSnapshot)
    : null;

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
  const maxPossibleScore = getMaxPossibleScore(
    test,
    questions,
    attempt.maxPossibleScore
  );

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

      if (
        codeData &&
        codeData.code &&
        codeData.language &&
        question.testCases &&
        question.testCases.length > 0
      ) {
        let allPassed = true;
        const testCaseResults: Array<{
          input: string;
          expectedOutput: string;
          actualOutput: string;
          passed: boolean;
          isHidden: boolean;
        }> = [];
        let earnedWeight = 0;
        let totalWeight = 0;

        for (const tc of question.testCases) {
          const result = await runCode(
            codeData.language,
            codeData.code,
            tc.input
          );
          const actualOutput = result.stdout.trim();
          const expectedOutput = tc.expectedOutput.trim();
          const passed =
            actualOutput === expectedOutput && result.exitCode === 0;
          const weight =
            typeof tc.weight === "number" && tc.weight >= 0 ? tc.weight : 1;
          totalWeight += weight;
          if (passed) earnedWeight += weight;

          testCaseResults.push({
            input: tc.input,
            expectedOutput: tc.expectedOutput,
            actualOutput:
              actualOutput +
              (result.stderr ? `\n[stderr]: ${result.stderr}` : ""),
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
          const selectedOption = question.options.find(
            (o) => o.id === selectedId
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

  const roundedSectionResults = Array.from(sectionBuckets.values()).map(
    (section) => {
      const score = Math.round(section.score * 100) / 100;
      const maxScore = Math.round(section.maxScore * 100) / 100;
      // Strip cutoffMarks when undefined. The client SDK is more
      // forgiving than the Admin SDK but spreading an undefined into a
      // Firestore set/update still surfaces as "invalid Firestore value"
      // depending on the call shape — keep both writers consistent.
      const { cutoffMarks, ...rest } = section;
      return {
        ...rest,
        score,
        maxScore,
        ...(typeof cutoffMarks === "number" ? { cutoffMarks } : {}),
        passed: cutoffMarks === undefined || score >= cutoffMarks,
      };
    }
  );
  const sectionCutoffsPassed = roundedSectionResults.every(
    (section) => section.passed !== false
  );
  const percentage =
    maxPossibleScore > 0 ? (totalScore / maxPossibleScore) * 100 : 0;
  const passed =
    (test ? totalScore >= test.passingMarks : percentage >= 40) &&
    sectionCutoffsPassed;

  const now = Timestamp.now();
  const updatedAttempt = {
    status: data.finalStatus || "completed",
    completedAt: now.toDate(),
    answers: evaluatedAnswers,
    totalScore: Math.round(totalScore * 100) / 100,
    maxPossibleScore,
    correctAnswers,
    wrongAnswers,
    unattempted:
      questions.length -
      data.answers.filter(
        (a) => a.selectedOptionId && a.selectedOptionId.trim() !== ""
      ).length,
    percentage: Math.round(percentage * 100) / 100,
    passed,
    sectionResults: roundedSectionResults,
    sectionCutoffsPassed,
    updatedAt: now.toDate(),
    remainingTime: data.remainingTime,
    ...(data.integrity
      ? {
          integrity: {
            tabSwitches: Math.max(0, Math.floor(Number(data.integrity.tabSwitches) || 0)),
            autoSubmitted: data.integrity.autoSubmitted === true,
          },
        }
      : {}),
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
  await setDoc(
    doc(db, "users", userId),
    {
      purchasedTests: arrayUnion(seriesId),
      purchasedTestSeriesIds: arrayUnion(seriesId),
      updatedAt: now.toDate(),
    },
    { merge: true }
  );

  return { id: purchaseId, ...purchaseData };
}

export async function enrollInFreeTestSeries(
  userId: string,
  seriesId: string
): Promise<TestPurchase> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error("Please sign in to enroll in this test series.");
  }
  if (currentUser.uid !== userId) {
    throw new Error(
      "Your session does not match this enrollment request. Please sign out and sign in again."
    );
  }

  const token = await currentUser.getIdToken();
  const response = await fetch("/api/tests/free-enrollment", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ userId, seriesId }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      payload.error || "Failed to enroll in this free test series."
    );
  }

  const purchase = payload.purchase;
  return {
    ...purchase,
    purchasedAt: purchase.purchasedAt
      ? new Date(purchase.purchasedAt)
      : new Date(),
    createdAt: purchase.createdAt ? new Date(purchase.createdAt) : new Date(),
    updatedAt: purchase.updatedAt ? new Date(purchase.updatedAt) : new Date(),
  } as TestPurchase;
}

export async function getUserActiveTestPurchase(
  userId: string,
  seriesId: string
): Promise<TestPurchase | null> {
  const q = query(testPurchasesCollection, where("userId", "==", userId));

  const snapshot = await getDocs(q);
  const purchases = mapDocs<TestPurchase>(snapshot);
  return (
    purchases.find(
      (purchase) =>
        purchase.seriesId === seriesId && purchase.status === "active"
    ) || null
  );
}
