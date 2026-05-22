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
    type DocumentData,
} from "firebase/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "../firebase/client";
import type {
    CreateQuestionBankQuestionInput,
    CreateQuestionInput,
    CreateQuizQuestionInput,
    QuestionBankFilters,
    QuestionBankQuestion,
    QuestionBankType,
    QuestionType,
    UpdateQuestionBankQuestionInput,
} from "@digimine/types";

const questionBankCollection = collection(db, "questionBank");

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

function normalizeOptions(data: Pick<CreateQuestionBankQuestionInput, "type" | "options">) {
    if (!isChoiceBankType(data.type) || !data.options) return undefined;
    return data.options.map((option) => ({
        ...option,
        id: (option as { id?: string }).id || uuidv4(),
    }));
}

function normalizeTags(tags?: string[]) {
    return Array.from(new Set((tags || []).map((tag) => tag.trim()).filter(Boolean)));
}

function isCodeBankType(type: QuestionBankType) {
    return type === "code" || type === "coding";
}

function isTextBankType(type: QuestionBankType) {
    return type === "text_input" || type === "nat" || type === "numerical" || type === "subjective";
}

function isChoiceBankType(type: QuestionBankType) {
    return type === "mcq" || type === "msq" || type === "true_false" || type === "aptitude";
}

function toQuestionType(type: QuestionBankType): QuestionType {
    if (isCodeBankType(type)) return "code";
    if (isTextBankType(type)) return "text_input";
    return "mcq";
}

function toQuizQuestionType(type: QuestionBankType): Exclude<QuestionType, "code"> {
    if (isCodeBankType(type)) {
        throw new Error("Code questions can only be used in full tests.");
    }
    return isTextBankType(type) ? "text_input" : "mcq";
}

export async function getQuestionBankQuestions(filters?: QuestionBankFilters): Promise<QuestionBankQuestion[]> {
    const snapshot = await getDocs(query(questionBankCollection, orderBy("createdAt", "desc")));
    const search = filters?.search?.trim().toLowerCase() || "";
    const tagFilters = (filters?.tags || []).map((tag) => tag.toLowerCase());

    return snapshot.docs
        .map((item) => mapDoc<QuestionBankQuestion>(item))
        .filter((question) => filters?.includeCode || !isCodeBankType(question.type))
        .filter((question) => !filters?.type || filters.type === "all" || toQuestionType(question.type) === toQuestionType(filters.type))
        .filter((question) => !filters?.difficulty || filters.difficulty === "all" || question.difficulty === filters.difficulty)
        .filter((question) => !filters?.status || filters.status === "all" || question.status === filters.status)
        .filter((question) => !filters?.topic || question.topic.toLowerCase() === filters.topic.toLowerCase())
        .filter((question) => !filters?.category || question.category.toLowerCase() === filters.category.toLowerCase())
        .filter((question) => tagFilters.length === 0 || tagFilters.every((tag) => question.tags.map((item) => item.toLowerCase()).includes(tag)))
        .filter((question) => {
            if (!search) return true;
            const haystack = [
                question.title,
                question.topic,
                question.category,
                question.subcategory || "",
                question.questionText,
                question.tags.join(" "),
            ].join(" ").toLowerCase();
            return haystack.includes(search);
        });
}

export async function getQuestionBankQuestion(id: string): Promise<QuestionBankQuestion | null> {
    const snapshot = await getDoc(doc(questionBankCollection, id));
    if (!snapshot.exists()) return null;
    return mapDoc<QuestionBankQuestion>(snapshot);
}

export async function createQuestionBankQuestion(data: CreateQuestionBankQuestionInput, createdBy: string): Promise<string> {
    const questionId = uuidv4();
    const questionRef = doc(questionBankCollection, questionId);
    const now = Timestamp.now();

    const payload: Omit<QuestionBankQuestion, "id"> = {
        title: data.title.trim(),
        type: data.type,
        questionText: data.questionText,
        options: normalizeOptions(data),
        correctAnswer: isTextBankType(data.type) ? data.correctAnswer?.trim() : undefined,
        explanation: data.explanation || undefined,
        marks: Number(data.marks) || 1,
        negativeMarks: Number(data.negativeMarks) || 0,
        difficulty: data.difficulty || "medium",
        topic: data.topic.trim(),
        category: data.category.trim(),
        subcategory: data.subcategory?.trim() || undefined,
        tags: normalizeTags(data.tags),
        status: data.status || "draft",
        supportedLanguages: isCodeBankType(data.type) ? data.supportedLanguages || [] : undefined,
        starters: isCodeBankType(data.type) ? data.starters || [] : undefined,
        testCases: isCodeBankType(data.type) ? data.testCases || [] : undefined,
        codeScoringMode: isCodeBankType(data.type) ? data.codeScoringMode || "all_or_nothing" : undefined,
        timeLimit: isCodeBankType(data.type) ? data.timeLimit || 2 : undefined,
        memoryLimit: isCodeBankType(data.type) ? data.memoryLimit || 128 : undefined,
        passageGroup: data.passageGroup?.trim() || undefined,
        passage: data.passage || undefined,
        usageCount: 0,
        createdAt: now.toDate(),
        updatedAt: now.toDate(),
        createdBy,
    };

    await setDoc(questionRef, sanitizeData(payload));
    return questionId;
}

export async function updateQuestionBankQuestion(data: UpdateQuestionBankQuestionInput): Promise<void> {
    const { id, ...updateData } = data;
    const options = updateData.type && isChoiceBankType(updateData.type) && updateData.options
        ? updateData.options.map((option) => ({ ...option, id: (option as { id?: string }).id || uuidv4() }))
        : updateData.options;

    await updateDoc(doc(questionBankCollection, id), sanitizeData({
        ...updateData,
        title: updateData.title?.trim(),
        topic: updateData.topic?.trim(),
        category: updateData.category?.trim(),
        subcategory: updateData.subcategory?.trim() || undefined,
        tags: updateData.tags ? normalizeTags(updateData.tags) : undefined,
        options,
        updatedAt: Timestamp.now(),
    }));
}

export async function deleteQuestionBankQuestion(id: string): Promise<void> {
    await deleteDoc(doc(questionBankCollection, id));
}

export async function incrementQuestionBankUsage(questionIds: string[]): Promise<void> {
    await Promise.all(
        questionIds.map(async (id) => {
            const question = await getQuestionBankQuestion(id);
            if (!question) return;
            await updateDoc(doc(questionBankCollection, id), {
                usageCount: (question.usageCount || 0) + 1,
                updatedAt: Timestamp.now(),
            });
        })
    );
}

function baseQuestionPayload(question: QuestionBankQuestion) {
    const type = toQuestionType(question.type);

    return {
        type,
        questionText: question.questionText,
        options: type === "mcq"
            ? question.options?.map((option) => ({ text: option.text, isCorrect: option.isCorrect }))
            : undefined,
        correctAnswer: type === "text_input" ? question.correctAnswer : undefined,
        explanation: question.explanation || undefined,
        marks: question.marks,
        negativeMarks: question.negativeMarks || undefined,
        difficulty: question.difficulty,
        passageGroup: question.passageGroup || undefined,
        passage: question.passage || undefined,
    };
}

export function questionBankToTestQuestionInput(
    question: QuestionBankQuestion,
    seriesId: string,
    testId: string,
    order: number,
    sectionId?: string
): CreateQuestionInput {
    return {
        seriesId,
        testId,
        ...baseQuestionPayload(question),
        order,
        sectionId: sectionId || undefined,
        supportedLanguages: isCodeBankType(question.type) ? question.supportedLanguages : undefined,
        starters: isCodeBankType(question.type) ? question.starters : undefined,
        testCases: isCodeBankType(question.type) ? question.testCases : undefined,
        codeScoringMode: isCodeBankType(question.type) ? question.codeScoringMode : undefined,
        timeLimit: isCodeBankType(question.type) ? question.timeLimit : undefined,
        memoryLimit: isCodeBankType(question.type) ? question.memoryLimit : undefined,
    };
}

export function questionBankToQuizQuestionInput(question: QuestionBankQuestion, quizId: string, order: number): CreateQuizQuestionInput {
    if (isCodeBankType(question.type)) {
        throw new Error("Code questions can only be used in full tests.");
    }

    return {
        quizId,
        ...(baseQuestionPayload(question) as Omit<CreateQuizQuestionInput, "quizId" | "type"> & { type: Exclude<QuestionType, "code"> }),
        type: toQuizQuestionType(question.type),
        order,
    };
}
