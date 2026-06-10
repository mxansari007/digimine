"use client";

import {
    collection,
    doc,
    getCountFromServer,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    Timestamp,
    type DocumentData,
} from "firebase/firestore";
import { auth, db } from "../firebase/client";
import type { CreateQuizInput, Quiz, TestSeries, Course, Contest } from "@digimine/types";
import { assertSlugAvailable } from "./slug";

/**
 * Freemium overlay applied to every piece of teacher-authored content.
 * Keeps the data shape in lockstep with the admin review queue and
 * matches the Firestore rules in `firebase/firestore.rules`.
 */
function teacherOverlay(teacherId: string) {
    return {
        teacherId,
        instituteId: null as string | null,
        classIds: [] as string[],
        visibility: "private" as const,
        reviewStatus: "draft" as const,
        reviewNotes: "",
        submittedForReviewAt: null,
        reviewedBy: null,
        reviewedAt: null,
        isDeleted: false,
        context: "teacher_classroom" as const,
    };
}

/**
 * Institute-mode overlay — content authored from the institute portal.
 * The `teacherId` is still the writer's uid (for credit + rule pass), but the
 * doc carries `instituteId` and is pre-published to the supplied `classIds`.
 */
function instituteOverlay(authorUid: string, instituteId: string, classIds: string[]) {
    return {
        teacherId: authorUid,
        instituteId,
        classIds,
        visibility: "private" as const,
        reviewStatus: "draft" as const,
        reviewNotes: "",
        submittedForReviewAt: null,
        reviewedBy: null,
        reviewedAt: null,
        isDeleted: false,
        context: "institute" as const,
    };
}

export type InstituteAuthorContext = {
    instituteId: string;
    classIds: string[];
};

/**
 * Map each content collection to the plan limit that governs it and a
 * human label for the upgrade message.
 */
const TEACHING_LIMIT_BY_COLLECTION = {
    quizzes: { key: "maxQuizzes", label: "quizzes" },
    tests: { key: "maxTests", label: "test series" },
    courses: { key: "maxCourses", label: "courses" },
    contests: { key: "maxContests", label: "contests" },
} as const;

/**
 * Enforce the caller's plan limit before creating content. The limit comes
 * from the server-resolved entitlements (`/api/me/teaching-features`, which
 * reads the subscriptionPlans doc the admin authored), and the current count
 * comes from an aggregate count of the teacher's existing docs — so what the
 * plan maker configured is what actually governs creation.
 *
 * Fails OPEN on resolver/network hiccups (a transient 500 must not block a
 * paying teacher), and -1 / missing limits mean unlimited. Throws a friendly
 * error (surfaced inline by the builder forms) when the cap is reached.
 */
async function assertWithinTeachingLimit(
    collectionName: keyof typeof TEACHING_LIMIT_BY_COLLECTION,
    teacherId: string
): Promise<void> {
    const { key, label } = TEACHING_LIMIT_BY_COLLECTION[collectionName];

    let max = -1;
    try {
        const user = auth.currentUser;
        if (!user) return;
        const token = await user.getIdToken();
        const res = await fetch("/api/me/teaching-features", {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        const value = data?.teachingLimits?.[key];
        max = typeof value === "number" && Number.isFinite(value) ? value : -1;
    } catch {
        return;
    }
    if (max < 0) return;

    const countSnap = await getCountFromServer(
        query(collection(db, collectionName), where("teacherId", "==", teacherId))
    );
    const current = countSnap.data().count;
    if (current >= max) {
        throw new Error(
            `Your current plan allows up to ${max} ${label}. ` +
                `Upgrade your plan to create more.`
        );
    }
}

/**
 * Remove keys with `undefined` values from an object.
 * Firestore rejects `undefined` — this prevents shared builder forms
 * (which use `field?: type` TypeScript patterns) from crashing writes.
 */
function stripUndefined<T extends Record<string, any>>(obj: T): Partial<T> {
    const result: Partial<T> = {};
    for (const key of Object.keys(obj) as Array<keyof T>) {
        if (obj[key] !== undefined) {
            result[key] = obj[key];
        }
    }
    return result;
}

function toDate(value: any): Date {
    if (!value) return new Date();
    if (typeof value.toDate === "function") return value.toDate();
    if (typeof value === "string") return new Date(value);
    if (value.seconds !== undefined) return new Date(value.seconds * 1000);
    return value instanceof Date ? value : new Date(value);
}

function mapDoc<T>(snapshot: DocumentData): T {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        ...data,
        createdAt: toDate(data.createdAt),
        updatedAt: toDate(data.updatedAt),
    } as T;
}

// ── Teacher Quizzes ────────────────────────────────────────────────────────

const quizzesCollection = collection(db, "quizzes");

export async function getTeacherQuizzes(teacherId: string): Promise<Quiz[]> {
    const q = query(
        quizzesCollection,
        where("teacherId", "==", teacherId),
        orderBy("createdAt", "desc")
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => mapDoc<Quiz>(d));
}

/**
 * Create a quiz authored by a teacher. Accepts the same `CreateQuizInput`
 * payload that the shared admin `QuizForm` emits, then applies the
 * teacher overlay (private + draft) before writing.
 */
export async function createTeacherQuiz(
    teacherId: string,
    payload: CreateQuizInput,
    institute?: InstituteAuthorContext
): Promise<string> {
    // Plan limit first (cheap deny), then slug reservation.
    await assertWithinTeachingLimit("quizzes", teacherId);
    // Key the document by its slug (format + uniqueness checked) so quizzes
    // are addressable by slug and a duplicate can't be created twice.
    const slug = await assertSlugAvailable("quizzes", payload.slug);
    const ref = doc(quizzesCollection, slug);
    const now = Timestamp.now();
    const overlay = institute
        ? instituteOverlay(teacherId, institute.instituteId, institute.classIds)
        : teacherOverlay(teacherId);
    await setDoc(ref, {
        ...stripUndefined(payload as any),
        slug,
        ...overlay,
        // Teacher content always starts as draft regardless of what the
        // form supplied — admin review is the only path to "published".
        status: "draft",
        createdBy: teacherId,
        totalQuestions: 0,
        totalMarks: 0,
        createdAt: now,
        updatedAt: now,
    });
    return ref.id;
}

/**
 * Update an existing teacher quiz. The teacher overlay fields
 * (teacherId, visibility, reviewStatus, ...) are NOT rewritten — those
 * are driven by the review workflow, not by editing the quiz body.
 */
export async function updateTeacherQuiz(
    teacherId: string,
    quizId: string,
    payload: CreateQuizInput
): Promise<void> {
    const ref = doc(quizzesCollection, quizId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error("Quiz not found");
    const existing = snap.data();
    if (existing.teacherId !== teacherId) {
        throw new Error("You can only edit your own quizzes.");
    }
    if (existing.reviewStatus === "pending_review") {
        throw new Error("Withdraw from review before editing this quiz.");
    }
    await updateDoc(ref, {
        ...stripUndefined(payload as any),
        updatedAt: Timestamp.now(),
    });
}

export async function getTeacherQuiz(quizId: string): Promise<Quiz | null> {
    const ref = doc(quizzesCollection, quizId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return mapDoc<Quiz>(snap);
}

function assertTeacherOwner(
    existing: Record<string, any>,
    teacherId: string,
    message = "You can only manage your own content."
) {
    if (existing.teacherId !== teacherId) {
        throw new Error(message);
    }
}

async function getOwnedTeacherDoc<T>(
    collectionName: "quizzes" | "tests" | "courses" | "contests",
    teacherId: string,
    contentId: string
): Promise<T | null> {
    const ref = doc(db, collectionName, contentId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    const existing = snap.data();
    assertTeacherOwner(existing, teacherId);
    return mapDoc<T>(snap);
}

export async function getOwnedTeacherQuiz(
    teacherId: string,
    quizId: string
): Promise<Quiz | null> {
    return getOwnedTeacherDoc<Quiz>("quizzes", teacherId, quizId);
}

/**
 * Owner-aware update for any teacher content collection.
 * Verifies the caller owns the document and that it is not currently
 * locked by an in-progress admin review before applying changes.
 */
async function updateOwnedTeacherDoc(
    collectionName: "quizzes" | "tests" | "courses" | "contests",
    teacherId: string,
    contentId: string,
    payload: Record<string, any>
): Promise<void> {
    const ref = doc(db, collectionName, contentId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error("Content not found");
    const existing = snap.data();
    assertTeacherOwner(existing, teacherId, "You can only edit your own content.");
    if (existing.reviewStatus === "pending_review") {
        throw new Error("Withdraw from review before editing.");
    }
    await updateDoc(ref, {
        ...stripUndefined(payload),
        updatedAt: Timestamp.now(),
    });
}

// ── Teacher Test Series ────────────────────────────────────────────────────

const testsCollection = collection(db, "tests");

export async function getTeacherTests(teacherId: string): Promise<TestSeries[]> {
    const q = query(
        testsCollection,
        where("teacherId", "==", teacherId),
        orderBy("createdAt", "desc")
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => mapDoc<TestSeries>(d));
}

export async function createTeacherTest(
    teacherId: string,
    data: Omit<TestSeries, "id" | "createdAt" | "updatedAt">,
    institute?: InstituteAuthorContext
): Promise<string> {
    await assertWithinTeachingLimit("tests", teacherId);
    // Key the document by its slug (format + uniqueness checked).
    const slug = await assertSlugAvailable("tests", (data as any).slug);
    const ref = doc(testsCollection, slug);
    const now = Timestamp.now();
    const overlay = institute
        ? instituteOverlay(teacherId, institute.instituteId, institute.classIds)
        : teacherOverlay(teacherId);
    await setDoc(ref, {
        ...stripUndefined(data as any),
        slug,
        ...overlay,
        status: "draft",
        createdBy: teacherId,
        createdAt: now,
        updatedAt: now,
    });
    return ref.id;
}

export async function getTeacherTest(testId: string): Promise<TestSeries | null> {
    const ref = doc(testsCollection, testId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return mapDoc<TestSeries>(snap);
}

export async function getOwnedTeacherTest(
    teacherId: string,
    testId: string
): Promise<TestSeries | null> {
    return getOwnedTeacherDoc<TestSeries>("tests", teacherId, testId);
}

export async function updateTeacherTest(
    teacherId: string,
    testId: string,
    payload: Partial<TestSeries>
): Promise<void> {
    return updateOwnedTeacherDoc("tests", teacherId, testId, payload);
}

// ── Teacher Courses ────────────────────────────────────────────────────────

const coursesCollection = collection(db, "courses");

export async function getTeacherCourses(teacherId: string): Promise<Course[]> {
    const q = query(
        coursesCollection,
        where("teacherId", "==", teacherId),
        orderBy("createdAt", "desc")
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => mapDoc<Course>(d));
}

export async function createTeacherCourse(
    teacherId: string,
    data: Omit<Course, "id" | "createdAt" | "updatedAt">,
    institute?: InstituteAuthorContext
): Promise<string> {
    await assertWithinTeachingLimit("courses", teacherId);
    // Key the document by its slug (format + uniqueness checked).
    const slug = await assertSlugAvailable("courses", (data as any).slug);
    const ref = doc(coursesCollection, slug);
    const now = Timestamp.now();
    const overlay = institute
        ? instituteOverlay(teacherId, institute.instituteId, institute.classIds)
        : teacherOverlay(teacherId);
    await setDoc(ref, {
        ...stripUndefined(data as any),
        slug,
        ...overlay,
        status: "draft",
        createdBy: teacherId,
        createdAt: now,
        updatedAt: now,
    });
    return ref.id;
}

export async function getTeacherCourse(
    teacherId: string,
    courseId: string
): Promise<Course | null> {
    return getOwnedTeacherDoc<Course>("courses", teacherId, courseId);
}

export async function updateTeacherCourse(
    teacherId: string,
    courseId: string,
    payload: Partial<Course>
): Promise<void> {
    return updateOwnedTeacherDoc("courses", teacherId, courseId, payload);
}

// ── Teacher Contests ───────────────────────────────────────────────────────

const contestsCollection = collection(db, "contests");

export async function getTeacherContests(teacherId: string): Promise<Contest[]> {
    const q = query(
        contestsCollection,
        where("teacherId", "==", teacherId),
        orderBy("createdAt", "desc")
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => mapDoc<Contest>(d));
}

export async function createTeacherContest(
    teacherId: string,
    data: Omit<Contest, "id" | "createdAt" | "updatedAt">,
    institute?: InstituteAuthorContext
): Promise<string> {
    await assertWithinTeachingLimit("contests", teacherId);
    // Key the document by its slug (format + uniqueness checked).
    const slug = await assertSlugAvailable("contests", (data as any).slug);
    const ref = doc(contestsCollection, slug);
    const now = Timestamp.now();
    const overlay = institute
        ? instituteOverlay(teacherId, institute.instituteId, institute.classIds)
        : teacherOverlay(teacherId);
    await setDoc(ref, {
        ...stripUndefined(data as any),
        slug,
        ...overlay,
        status: "draft",
        createdBy: teacherId,
        createdAt: now,
        updatedAt: now,
    });
    return ref.id;
}

export async function getTeacherContest(
    teacherId: string,
    contestId: string
): Promise<Contest | null> {
    return getOwnedTeacherDoc<Contest>("contests", teacherId, contestId);
}

export async function updateTeacherContest(
    teacherId: string,
    contestId: string,
    payload: Partial<Contest>
): Promise<void> {
    return updateOwnedTeacherDoc("contests", teacherId, contestId, payload);
}

// ── Generic Update/Delete ──────────────────────────────────────────────────

export async function updateTeacherContent(
    collectionName: "quizzes" | "tests" | "courses" | "contests",
    teacherId: string,
    contentId: string,
    data: Partial<Quiz | TestSeries | Course | Contest>
): Promise<void> {
    await updateOwnedTeacherDoc(collectionName, teacherId, contentId, data as Record<string, any>);
}

export async function deleteTeacherContent(
    collectionName: "quizzes" | "tests" | "courses" | "contests",
    teacherId: string,
    contentId: string
): Promise<void> {
    const ref = doc(db, collectionName, contentId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error("Content not found");
    const existing = snap.data();
    assertTeacherOwner(existing, teacherId);
    // Match the update path: refuse to destroy content while it's under
    // admin review. Hard-deleting mid-review would destroy the audit
    // trail the reviewer is looking at.
    if (existing.reviewStatus === "pending_review") {
        throw new Error("Withdraw from review before deleting this content.");
    }
    await deleteDoc(ref);
}

export async function publishTeacherContent(
    collectionName: "quizzes" | "tests" | "courses" | "contests",
    teacherId: string,
    contentId: string,
    options?: { classIds?: string[] }
): Promise<void> {
    const payload: Record<string, any> = { status: "published" };
    if (options?.classIds) {
        payload.classIds = options.classIds;
    }
    await updateOwnedTeacherDoc(collectionName, teacherId, contentId, payload);
}

export async function setContentClassIds(
    collectionName: "quizzes" | "tests" | "courses" | "contests",
    teacherId: string,
    contentId: string,
    classIds: string[]
): Promise<void> {
    await updateOwnedTeacherDoc(collectionName, teacherId, contentId, {
        classIds,
    });
}

export async function unpublishTeacherContent(
    collectionName: "quizzes" | "tests" | "courses" | "contests",
    teacherId: string,
    contentId: string
): Promise<void> {
    await updateOwnedTeacherDoc(collectionName, teacherId, contentId, {
        status: "draft",
    });
}

export async function submitContentForReview(
    collectionName: "quizzes" | "tests" | "courses" | "contests",
    teacherId: string,
    contentId: string,
    suggestedPrice?: number
): Promise<void> {
    await updateOwnedTeacherDoc(collectionName, teacherId, contentId, {
        reviewStatus: "pending_review",
        visibility: "submitted_for_review",
        suggestedPrice: suggestedPrice || 0,
        submittedForReviewAt: Timestamp.now(),
    });
}
