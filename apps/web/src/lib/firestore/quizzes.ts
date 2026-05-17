"use client";

import {
    collection,
    doc,
    getDoc,
    getDocs,
    orderBy,
    query,
    where,
    type DocumentData,
} from "firebase/firestore";
import { db } from "../firebase/client";
import type { Quiz, QuizAttempt, QuizQuestion } from "@digimine/types";

const quizzesCollection = collection(db, "quizzes");
const quizAttemptsCollection = collection(db, "quizAttempts");

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
        startedAt: toDate(data.startedAt),
        completedAt: toDate(data.completedAt),
        endTime: toDate(data.endTime),
    } as T;
}

export async function getPublishedQuizzes(filters?: { category?: string }): Promise<Quiz[]> {
    let q = query(quizzesCollection, where("status", "==", "published"), orderBy("createdAt", "desc"));
    if (filters?.category) {
        q = query(q, where("category", "==", filters.category));
    }
    const snapshot = await getDocs(q);
    return snapshot.docs.map((item) => mapDoc<Quiz>(item));
}

export async function getQuizBySlug(slug: string): Promise<Quiz | null> {
    const direct = await getDoc(doc(db, "quizzes", slug));
    if (direct.exists()) return mapDoc<Quiz>(direct);

    const snapshot = await getDocs(query(quizzesCollection, where("slug", "==", slug)));
    if (snapshot.empty) return null;
    return mapDoc<Quiz>(snapshot.docs[0]);
}

export async function getQuizById(quizId: string): Promise<Quiz | null> {
    const snapshot = await getDoc(doc(db, "quizzes", quizId));
    if (!snapshot.exists()) return null;
    return mapDoc<Quiz>(snapshot);
}

export async function getQuizQuestions(quizId: string): Promise<QuizQuestion[]> {
    const snapshot = await getDocs(query(collection(db, "quizzes", quizId, "questions"), orderBy("order", "asc")));
    return snapshot.docs.map((item) => mapDoc<QuizQuestion>(item));
}

export async function getQuizAttempt(attemptId: string): Promise<QuizAttempt | null> {
    const snapshot = await getDoc(doc(db, "quizAttempts", attemptId));
    if (!snapshot.exists()) return null;
    return mapDoc<QuizAttempt>(snapshot);
}

export async function getUserQuizAttempts(userId: string, quizId?: string): Promise<QuizAttempt[]> {
    const snapshot = await getDocs(query(quizAttemptsCollection, where("userId", "==", userId)));
    return snapshot.docs
        .map((item) => mapDoc<QuizAttempt>(item))
        .filter((attempt) => !quizId || attempt.quizId === quizId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}
