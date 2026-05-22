"use client";

import {
    collection,
    doc,
    getDocs,
    setDoc,
    updateDoc,
    deleteDoc,
    query,
    orderBy,
    Timestamp,
    type DocumentData,
} from "firebase/firestore";
import { db } from "../firebase/client";
import type { QuestionBankQuestion } from "@digimine/types";

function toDate(value: any): Date {
    if (!value) return new Date();
    if (typeof value.toDate === "function") return value.toDate();
    if (typeof value === "string") return new Date(value);
    if (value.seconds !== undefined) return new Date(value.seconds * 1000);
    return value instanceof Date ? value : new Date(value);
}

function mapDoc(snapshot: DocumentData): QuestionBankQuestion {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        ...data,
        createdAt: toDate(data.createdAt),
        updatedAt: toDate(data.updatedAt),
    } as QuestionBankQuestion;
}

export function getTeacherQuestionsCollection(teacherId: string) {
    return collection(db, "teachers", teacherId, "questions");
}

export async function getTeacherQuestions(teacherId: string): Promise<QuestionBankQuestion[]> {
    const q = query(getTeacherQuestionsCollection(teacherId), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => mapDoc(d));
}

export async function createTeacherQuestion(
    teacherId: string,
    data: Omit<QuestionBankQuestion, "id" | "createdAt" | "updatedAt">
): Promise<string> {
    const ref = doc(getTeacherQuestionsCollection(teacherId));
    const now = Timestamp.now();
    await setDoc(ref, {
        ...data,
        createdAt: now,
        updatedAt: now,
    });
    return ref.id;
}

export async function updateTeacherQuestion(
    teacherId: string,
    questionId: string,
    data: Partial<QuestionBankQuestion>
): Promise<void> {
    const ref = doc(getTeacherQuestionsCollection(teacherId), questionId);
    await updateDoc(ref, {
        ...data,
        updatedAt: Timestamp.now(),
    });
}

export async function submitTeacherQuestionForReview(
    teacherId: string,
    questionId: string,
    suggestedPrice?: number
): Promise<void> {
    const ref = doc(getTeacherQuestionsCollection(teacherId), questionId);
    await updateDoc(ref, {
        visibility: "submitted_for_review",
        suggestedPrice: suggestedPrice || 0,
        submittedForReviewAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
    });
}

export async function deleteTeacherQuestion(teacherId: string, questionId: string): Promise<void> {
    await deleteDoc(doc(getTeacherQuestionsCollection(teacherId), questionId));
}
