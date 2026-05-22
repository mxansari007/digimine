"use client";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  orderBy,
  query,
  where,
  Timestamp,
  type DocumentData,
} from "firebase/firestore";
import { db } from "../firebase/client";
import type {
  Quiz,
  QuizAttempt,
  QuizQuestion,
  CreateQuizQuestionInput,
  UpdateQuizQuestionInput,
} from "@digimine/types";
import { v4 as uuidv4 } from "uuid";

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

function isPublicCatalogQuiz(quiz: Quiz & { teacherId?: string; visibility?: string }): boolean {
  // Admin-authored content: no teacherId, just needs status published
  if (!quiz.teacherId && quiz.status === "published") return true;
  // Teacher-authored content: must have admin-approved visibility
  if (quiz.teacherId && quiz.visibility === "published") return true;
  return false;
}

function reviveCatalogQuiz(raw: any): Quiz {
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
  } as Quiz;
}

async function fetchCatalogJson<T = any>(path: string): Promise<T | null> {
  try {
    if (typeof window === "undefined") return null;
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function getPublishedQuizzes(filters?: {
  category?: string;
}): Promise<Quiz[]> {
  // Route through the server catalog API (admin SDK) — no rule/index races.
  const params = new URLSearchParams();
  if (filters?.category) params.set("category", filters.category);
  const query = params.toString() ? `?${params.toString()}` : "";
  const payload = await fetchCatalogJson<{ items: any[] }>(`/api/catalog/quizzes${query}`);
  if (!payload || !Array.isArray(payload.items)) return [];
  return payload.items.map(reviveCatalogQuiz);
}

export async function getQuizBySlug(slug: string): Promise<Quiz | null> {
  // Server catalog API first.
  const payload = await fetchCatalogJson<{ quiz: any }>(`/api/catalog/quizzes?slug=${encodeURIComponent(slug)}`);
  if (payload && payload.quiz) {
    return reviveCatalogQuiz(payload.quiz);
  }

  // Fallback (server-side or API miss): direct read by id/slug.
  const direct = await getDoc(doc(db, "quizzes", slug));
  if (direct.exists()) {
    const quiz = mapDoc<Quiz & { teacherId?: string; visibility?: string }>(direct);
    return isPublicCatalogQuiz(quiz) ? quiz : null;
  }

  const snapshot = await getDocs(
    query(
      quizzesCollection,
      where("slug", "==", slug),
      where("status", "==", "published")
    )
  );
  const quiz = snapshot.docs
    .map((item) => mapDoc<Quiz & { teacherId?: string; visibility?: string }>(item))
    .find(isPublicCatalogQuiz);
  return quiz || null;
}

export async function getQuizById(quizId: string): Promise<Quiz | null> {
  const snapshot = await getDoc(doc(db, "quizzes", quizId));
  if (!snapshot.exists()) return null;
  return mapDoc<Quiz>(snapshot);
}

export async function getQuizQuestions(
  quizId: string
): Promise<QuizQuestion[]> {
  const snapshot = await getDocs(
    query(
      collection(db, "quizzes", quizId, "questions"),
      orderBy("order", "asc")
    )
  );
  return snapshot.docs.map((item) => mapDoc<QuizQuestion>(item));
}

export async function getQuizAttempt(
  attemptId: string
): Promise<QuizAttempt | null> {
  const snapshot = await getDoc(doc(db, "quizAttempts", attemptId));
  if (!snapshot.exists()) return null;
  return mapDoc<QuizAttempt>(snapshot);
}

export async function getUserQuizAttempts(
  userId: string,
  quizId?: string
): Promise<QuizAttempt[]> {
  const snapshot = await getDocs(
    query(quizAttemptsCollection, where("userId", "==", userId))
  );
  return snapshot.docs
    .map((item) => mapDoc<QuizAttempt>(item))
    .filter((attempt) => !quizId || attempt.quizId === quizId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

// ── Teacher Quiz Question CRUD ─────────────────────────────────────────────

function sanitizeQuizData(data: any): any {
  if (data === null || data === undefined) return data;
  if (
    data instanceof Date ||
    (data.seconds !== undefined && data.nanoseconds !== undefined)
  )
    return data;
  if (Array.isArray(data)) return data.map(sanitizeQuizData);
  if (typeof data === "object") {
    const result: any = {};
    for (const key in data) {
      if (data[key] !== undefined) result[key] = sanitizeQuizData(data[key]);
    }
    return result;
  }
  return data;
}

export async function createTeacherQuizQuestion(
  data: CreateQuizQuestionInput
): Promise<string> {
  const questionId = uuidv4();
  const questionRef = doc(db, "quizzes", data.quizId, "questions", questionId);
  const now = Timestamp.now();

  let options = data.options;
  if (data.type === "mcq" && options) {
    options = options.map((opt) => ({
      ...opt,
      id: (opt as any).id || uuidv4(),
    }));
  }

  const questionData: Omit<QuizQuestion, "id"> = {
    ...data,
    options: options as any,
    negativeMarks: data.negativeMarks || 0,
    difficulty: data.difficulty || "medium",
    order: data.order || 0,
    createdAt: now.toDate(),
    updatedAt: now.toDate(),
  };

  await setDoc(questionRef, sanitizeQuizData(questionData));

  // Recalculate quiz stats
  const questions = await getQuizQuestions(data.quizId);
  const totalMarks = questions.reduce((sum, q) => sum + (q.marks || 0), 0);
  await updateDoc(doc(db, "quizzes", data.quizId), {
    totalQuestions: questions.length,
    totalMarks,
    updatedAt: now.toDate(),
  });

  return questionId;
}

export async function updateTeacherQuizQuestion(
  data: UpdateQuizQuestionInput
): Promise<void> {
  const { id, quizId, ...updateData } = data;
  const questionRef = doc(db, "quizzes", quizId, "questions", id);

  let options = updateData.options;
  if (updateData.type === "mcq" && options) {
    options = options.map((opt) => ({
      ...opt,
      id: (opt as any).id || uuidv4(),
    }));
  }

  const payload = {
    ...updateData,
    options,
    updatedAt: Timestamp.now().toDate(),
  };

  await updateDoc(questionRef, sanitizeQuizData(payload));

  // Recalculate quiz stats
  const questions = await getQuizQuestions(quizId);
  const totalMarks = questions.reduce((sum, q) => sum + (q.marks || 0), 0);
  await updateDoc(doc(db, "quizzes", quizId), {
    totalQuestions: questions.length,
    totalMarks,
    updatedAt: Timestamp.now().toDate(),
  });
}

export async function deleteTeacherQuizQuestion(
  quizId: string,
  questionId: string
): Promise<void> {
  await deleteDoc(doc(db, "quizzes", quizId, "questions", questionId));

  // Recalculate quiz stats
  const questions = await getQuizQuestions(quizId);
  const totalMarks = questions.reduce((sum, q) => sum + (q.marks || 0), 0);
  await updateDoc(doc(db, "quizzes", quizId), {
    totalQuestions: questions.length,
    totalMarks,
    updatedAt: Timestamp.now().toDate(),
  });
}
