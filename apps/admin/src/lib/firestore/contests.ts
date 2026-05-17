"use client";

import {
    collection as firestoreCollection,
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    orderBy,
    query,
    setDoc,
    Timestamp,
    updateDoc,
    writeBatch,
    type DocumentData,
} from "firebase/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "../firebase/client";
import { getTestById, getTestSeries } from "./tests";
import { getQuiz } from "./quizzes";
import type { Contest, ContestSourceType, CreateContestInput, CreateQuizQuestionInput, TestStatus, UpdateContestInput } from "@digimine/types";

const contestsCollection = collection(db, "contests");

function toDate(value: any): Date | undefined {
    if (!value) return undefined;
    if (typeof value.toDate === "function") return value.toDate();
    if (typeof value === "string") return new Date(value);
    if (value.seconds !== undefined) return new Date(value.seconds * 1000);
    return value;
}

function mapDoc<T>(snapshot: DocumentData): T {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        ...data,
        startTime: toDate(data.startTime),
        endTime: toDate(data.endTime),
        createdAt: toDate(data.createdAt),
        updatedAt: toDate(data.updatedAt),
    } as T;
}

function cleanObject<T extends Record<string, any>>(value: T): T {
    return Object.fromEntries(
        Object.entries(value).filter(([, item]) => item !== undefined)
    ) as T;
}

function normalizeQuestionOptions(question: CreateQuizQuestionInput) {
    if (question.type !== "mcq" || !question.options) return undefined;
    return question.options.map((option) => ({
        ...option,
        id: (option as { id?: string }).id || uuidv4(),
    }));
}

async function upsertCustomQuiz(data: CreateContestInput | UpdateContestInput, title: string, slug: string, createdBy?: string) {
    const quizId = data.quizId || `contest-${slug}`;
    const questions = data.customQuestions || [];
    const now = Timestamp.now();
    const totalQuestions = questions.length;
    const totalMarks = questions.reduce((sum, question) => sum + (Number(question.marks) || 0), 0);
    const durationMinutes = Math.max(1, Math.ceil(((data.endTime!.getTime() - data.startTime!.getTime()) / 1000) / 60));

    const quizRef = doc(db, "quizzes", quizId);
    const batch = writeBatch(db);
    const existingQuestions = await getDocs(firestoreCollection(quizRef, "questions"));
    existingQuestions.docs.forEach((question) => batch.delete(question.ref));

    batch.set(quizRef, cleanObject({
        title,
        slug: `${slug}-paper`,
        description: data.description?.trim() || "",
        shortDescription: data.shortDescription?.trim() || "",
        thumbnailURL: data.thumbnailURL || null,
        status: "published",
        accessType: "free",
        category: data.category || "",
        tags: data.tags || [],
        timeLimitMinutes: durationMinutes,
        passingPercentage: 0,
        totalQuestions,
        totalMarks,
        shuffleQuestions: false,
        shuffleOptions: false,
        showExplanations: true,
        linkedCourseIds: [],
        updatedAt: now.toDate(),
        ...(createdBy ? { createdAt: now.toDate(), createdBy } : {}),
    }), { merge: true });

    questions.forEach((question, index) => {
        const questionRef = doc(firestoreCollection(quizRef, "questions"), uuidv4());
        batch.set(questionRef, cleanObject({
            quizId,
            type: question.type,
            questionText: question.questionText,
            options: normalizeQuestionOptions(question),
            correctAnswer: question.type === "text_input" ? question.correctAnswer : undefined,
            explanation: question.explanation || undefined,
            marks: Number(question.marks) || 1,
            negativeMarks: Number(question.negativeMarks) || 0,
            difficulty: question.difficulty || "medium",
            order: question.order ?? index,
            passageGroup: question.passageGroup || undefined,
            passage: question.passage || undefined,
            createdAt: now.toDate(),
            updatedAt: now.toDate(),
        }));
    });

    await batch.commit();
    return { quizId, totalQuestions, totalMarks };
}

async function buildContestPayload(data: CreateContestInput | UpdateContestInput, createdBy?: string) {
    const title = data.title?.trim();
    const slug = data.slug?.trim();
    const sourceType: ContestSourceType = data.sourceType || "test";
    const startTime = data.startTime;
    const endTime = data.endTime;

    if (!title) throw new Error("Contest title is required.");
    if (!slug) throw new Error("Contest slug is required.");
    if (!startTime || !endTime) throw new Error("Contest start and end time are required.");
    if (endTime <= startTime) throw new Error("Contest end time must be after start time.");

    let sourcePayload: Record<string, unknown> = {};
    let thumbnailURL = data.thumbnailURL || null;
    let category = data.category || "";
    let tags = data.tags || [];

    if (sourceType === "test") {
        const seriesId = data.seriesId;
        const testId = data.testId;
        if (!seriesId) throw new Error("Select a test series.");
        if (!testId) throw new Error("Select a test.");

        const [series, test] = await Promise.all([
            getTestSeries(seriesId),
            getTestById(seriesId, testId),
        ]);

        if (!series) throw new Error("Selected test series was not found.");
        if (!test) throw new Error("Selected test was not found.");

        thumbnailURL = thumbnailURL || series.thumbnailURL || null;
        category = category || series.category || "";
        tags = tags.length > 0 ? tags : series.tags || [];
        sourcePayload = {
            sourceType,
            seriesId,
            testId,
            seriesTitle: series.title,
            testTitle: test.title,
            quizId: null,
            quizTitle: null,
            totalQuestions: test.totalQuestions || 0,
            totalMarks: test.totalMarks || 0,
            passingMarks: test.passingMarks || 0,
        };
    } else if (sourceType === "quiz") {
        if (!data.quizId) throw new Error("Select a quiz.");
        const quiz = await getQuiz(data.quizId);
        if (!quiz) throw new Error("Selected quiz was not found.");
        thumbnailURL = thumbnailURL || quiz.thumbnailURL || null;
        category = category || quiz.category || "";
        tags = tags.length > 0 ? tags : quiz.tags || [];
        sourcePayload = {
            sourceType,
            seriesId: null,
            testId: null,
            seriesTitle: null,
            testTitle: null,
            quizId: quiz.id,
            quizTitle: quiz.title,
            totalQuestions: quiz.totalQuestions || 0,
            totalMarks: quiz.totalMarks || 0,
            passingMarks: quiz.passingPercentage ? Math.round(((quiz.totalMarks || 0) * quiz.passingPercentage) / 100) : 0,
        };
    } else {
        const existingCustomQuizId = data.quizId;
        const hasQuestions = (data.customQuestions || []).length > 0;
        if (!hasQuestions && !existingCustomQuizId) {
            throw new Error("Upload at least one question for a custom contest.");
        }

        const quizStats = hasQuestions
            ? await upsertCustomQuiz(data, title, slug, createdBy)
            : {
                quizId: existingCustomQuizId!,
                totalQuestions: 0,
                totalMarks: 0,
            };
        const quiz = await getQuiz(quizStats.quizId);
        const totalQuestions = hasQuestions ? quizStats.totalQuestions : quiz?.totalQuestions || 0;
        const totalMarks = hasQuestions ? quizStats.totalMarks : quiz?.totalMarks || 0;
        thumbnailURL = thumbnailURL || quiz?.thumbnailURL || null;
        sourcePayload = {
            sourceType,
            seriesId: null,
            testId: null,
            seriesTitle: null,
            testTitle: null,
            quizId: quizStats.quizId,
            quizTitle: quiz?.title || title,
            totalQuestions,
            totalMarks,
            passingMarks: 0,
        };
    }

    return cleanObject({
        title,
        slug,
        description: data.description?.trim() || "",
        shortDescription: data.shortDescription?.trim() || "",
        thumbnailURL,
        status: data.status || "draft",
        ...sourcePayload,
        category,
        tags,
        startTime,
        endTime,
        updatedAt: Timestamp.now().toDate(),
        ...(createdBy ? { createdBy, createdAt: Timestamp.now().toDate() } : {}),
    });
}

export async function getAllContests(): Promise<Contest[]> {
    const snapshot = await getDocs(query(contestsCollection, orderBy("startTime", "desc")));
    return snapshot.docs.map((item) => mapDoc<Contest>(item));
}

export async function getContest(contestId: string): Promise<Contest | null> {
    const snapshot = await getDoc(doc(contestsCollection, contestId));
    if (!snapshot.exists()) return null;
    return mapDoc<Contest>(snapshot);
}

export async function createContest(data: CreateContestInput, createdBy: string): Promise<string> {
    const contestRef = doc(contestsCollection, data.slug);
    const payload = await buildContestPayload(data, createdBy);
    await setDoc(contestRef, payload);
    return data.slug;
}

export async function updateContest(data: UpdateContestInput): Promise<void> {
    const { id } = data;
    const payload = await buildContestPayload(data);
    await updateDoc(doc(contestsCollection, id), payload);
}

export async function updateContestStatus(id: string, status: TestStatus): Promise<void> {
    await updateDoc(doc(contestsCollection, id), {
        status,
        updatedAt: Timestamp.now().toDate(),
    });
}

export async function deleteContest(id: string): Promise<void> {
    await deleteDoc(doc(contestsCollection, id));
}
