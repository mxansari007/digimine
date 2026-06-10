"use client";

import {
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
    where,
    writeBatch,
    type DocumentData,
} from "firebase/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "../firebase/client";
import { assertSlugAvailable } from "./slug";
import type {
    CreateQuizInput,
    CreateQuizQuestionInput,
    Quiz,
    QuizQuestion,
    QuizStatus,
    UpdateQuizInput,
    UpdateQuizQuestionInput,
} from "@digimine/types";

const quizzesCollection = collection(db, "quizzes");

function toDate(value: any) {
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
        createdAt: toDate(data.createdAt),
        updatedAt: toDate(data.updatedAt),
    } as T;
}

function sanitizeData(data: any): any {
    if (data === null || data === undefined) return data;
    if (data instanceof Date || (data.seconds !== undefined && data.nanoseconds !== undefined)) return data;
    if (Array.isArray(data)) return data.map(sanitizeData);
    if (typeof data === "object") {
        const result: Record<string, unknown> = {};
        Object.keys(data).forEach((key) => {
            if (data[key] !== undefined) result[key] = sanitizeData(data[key]);
        });
        return result;
    }
    return data;
}

async function recalculateQuizStats(quizId: string) {
    const questions = await getQuizQuestions(quizId);
    const quizRef = doc(db, "quizzes", quizId);
    await updateDoc(quizRef, {
        totalQuestions: questions.length,
        totalMarks: questions.reduce((total, question) => total + (Number(question.marks) || 0), 0),
        updatedAt: Timestamp.now(),
    });
}

export async function getAllQuizzes(filters?: { status?: QuizStatus; category?: string }): Promise<Quiz[]> {
    let q = query(quizzesCollection, orderBy("createdAt", "desc"));

    if (filters?.status) q = query(q, where("status", "==", filters.status));
    if (filters?.category) q = query(q, where("category", "==", filters.category));

    const snapshot = await getDocs(q);
    return snapshot.docs.map((item) => mapDoc<Quiz>(item));
}

export async function getQuiz(quizId: string): Promise<Quiz | null> {
    const snapshot = await getDoc(doc(db, "quizzes", quizId));
    if (!snapshot.exists()) return null;
    return mapDoc<Quiz>(snapshot);
}

export async function createQuiz(data: CreateQuizInput, createdBy: string): Promise<string> {
    // Reserve the slug (format-checked + uniqueness-checked) before using it
    // as the document ID, so a duplicate slug can't silently overwrite an
    // existing quiz and inherit its questions subcollection.
    const quizId = await assertSlugAvailable("quizzes", data.slug);
    const quizRef = doc(db, "quizzes", quizId);
    const now = Timestamp.now();

    const quizData: Omit<Quiz, "id"> = {
        title: data.title,
        // Keep the slug field in lockstep with the document ID.
        slug: quizId,
        description: data.description || "",
        shortDescription: data.shortDescription || "",
        thumbnailURL: data.thumbnailURL || null,
        status: data.status || "draft",
        accessType: data.accessType || "free",
        category: data.category || "",
        tags: data.tags || [],
        timeLimitMinutes: data.timeLimitMinutes || 0,
        passingPercentage: data.passingPercentage ?? 0,
        totalQuestions: 0,
        totalMarks: 0,
        shuffleQuestions: data.shuffleQuestions ?? false,
        shuffleOptions: data.shuffleOptions ?? false,
        showExplanations: data.showExplanations ?? true,
        linkedCourseIds: data.linkedCourseIds || [],
        // Admin-authored public catalog markers — required so the public list
        // query (`teacherId == ""`) matches this doc.
        teacherId: "",
        isDeleted: false,
        createdAt: now.toDate(),
        updatedAt: now.toDate(),
        createdBy,
    } as Omit<Quiz, "id">;

    await setDoc(quizRef, sanitizeData(quizData));
    return quizId;
}

export async function updateQuiz(data: UpdateQuizInput): Promise<void> {
    const { id, ...updateData } = data;
    await updateDoc(doc(db, "quizzes", id), sanitizeData({
        ...updateData,
        updatedAt: Timestamp.now(),
    }));
}

export async function deleteQuiz(quizId: string): Promise<void> {
    const batch = writeBatch(db);
    const quizRef = doc(db, "quizzes", quizId);
    const questionsSnapshot = await getDocs(collection(quizRef, "questions"));
    questionsSnapshot.docs.forEach((question) => batch.delete(question.ref));
    batch.delete(quizRef);
    await batch.commit();
}

export async function getQuizQuestions(quizId: string): Promise<QuizQuestion[]> {
    const snapshot = await getDocs(query(collection(db, "quizzes", quizId, "questions"), orderBy("order", "asc")));
    return snapshot.docs.map((item) => mapDoc<QuizQuestion>(item));
}

export async function createQuizQuestion(data: CreateQuizQuestionInput): Promise<string> {
    const questionId = uuidv4();
    const questionRef = doc(db, "quizzes", data.quizId, "questions", questionId);
    const now = Timestamp.now();
    const options = data.type === "mcq" && data.options
        ? data.options.map((option) => ({ ...option, id: (option as any).id || uuidv4() }))
        : undefined;

    const questionData: Omit<QuizQuestion, "id"> = {
        quizId: data.quizId,
        type: data.type,
        questionText: data.questionText,
        options: options as any,
        correctAnswer: data.type === "text_input" ? data.correctAnswer : undefined,
        explanation: data.explanation || undefined,
        marks: data.marks,
        negativeMarks: data.negativeMarks || 0,
        difficulty: data.difficulty || "medium",
        order: data.order || 0,
        passageGroup: data.passageGroup || undefined,
        passage: data.passage || undefined,
        createdAt: now.toDate(),
        updatedAt: now.toDate(),
    };

    await setDoc(questionRef, sanitizeData(questionData));
    await recalculateQuizStats(data.quizId);
    return questionId;
}

export async function updateQuizQuestion(data: UpdateQuizQuestionInput): Promise<void> {
    const { id, quizId, ...updateData } = data;
    const options = updateData.type === "mcq" && updateData.options
        ? updateData.options.map((option) => ({ ...option, id: (option as any).id || uuidv4() }))
        : updateData.options;

    await updateDoc(doc(db, "quizzes", quizId, "questions", id), sanitizeData({
        ...updateData,
        options,
        updatedAt: Timestamp.now(),
    }));
    await recalculateQuizStats(quizId);
}

export async function deleteQuizQuestion(quizId: string, questionId: string): Promise<void> {
    await deleteDoc(doc(db, "quizzes", quizId, "questions", questionId));
    await recalculateQuizStats(quizId);
}
