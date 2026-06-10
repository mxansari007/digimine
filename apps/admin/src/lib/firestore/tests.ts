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
    Timestamp,
    writeBatch,
    type DocumentData,
} from "firebase/firestore";
import { db } from "../firebase/client";
import type { 
    TestSeries, 
    Test,
    Question, 
    CreateTestSeriesInput, 
    UpdateTestSeriesInput,
    CreateTestInput,
    UpdateTestInput,
    CreateQuestionInput,
    UpdateQuestionInput,
    TestStatus,
    TestSectionInput,
} from "@digimine/types";
import { v4 as uuidv4 } from "uuid";
import { assertSlugAvailable } from "./slug";

// Collection Refs
const testsCollection = collection(db, "tests");

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
    } as T;
}

function mapDocs<T>(snapshot: { docs: DocumentData[] }): T[] {
    return snapshot.docs.map((doc) => mapDoc<T>(doc));
}

function sanitizeData(data: any): any {
    if (data === null || data === undefined) return data;
    
    // Preserve Dates and Timestamps
    if (data instanceof Date || (data.seconds !== undefined && data.nanoseconds !== undefined)) {
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
            marksPerQuestion: typeof section.marksPerQuestion === "number" ? section.marksPerQuestion : undefined,
            negativeMarks: typeof section.negativeMarks === "number" ? section.negativeMarks : undefined,
            cutoffMarks: typeof section.cutoffMarks === "number" ? section.cutoffMarks : undefined,
        }))
        .filter((section) => section.title)
        .sort((a, b) => a.order - b.order)
        .map((section, index) => ({ ...section, order: index }));
}

// --- Test Series ---

export async function getAllTestSeries(filters?: { status?: TestStatus; category?: string }): Promise<TestSeries[]> {
    let q = query(testsCollection, orderBy("createdAt", "desc"));

    if (filters?.status) {
        q = query(q, where("status", "==", filters.status));
    }

    if (filters?.category) {
        q = query(q, where("category", "==", filters.category));
    }

    const snapshot = await getDocs(q);
    return mapDocs<TestSeries>(snapshot);
}

// Backward compatibility
export const getAllTests = getAllTestSeries;

export async function getTestSeries(seriesId: string): Promise<TestSeries | null> {
    const docRef = doc(testsCollection, seriesId);
    const snapshot = await getDoc(docRef);
    if (!snapshot.exists()) return null;
    return mapDoc<TestSeries>(snapshot);
}

// Backward compatibility
export const getTest = getTestSeries;

export async function createTestSeries(data: CreateTestSeriesInput, createdBy: string): Promise<string> {
    // Reserve the slug before using it as the document ID so a duplicate
    // can't overwrite an existing series (and its tests/questions subtree).
    const slug = await assertSlugAvailable("tests", data.slug);
    const docRef = doc(testsCollection, slug);
    const now = Timestamp.now();

    const seriesData: Omit<TestSeries, "id"> = {
        ...data,
        // Keep the slug field in lockstep with the document ID.
        slug,
        thumbnailURL: data.thumbnailURL || null,
        status: data.status || "draft",
        tags: data.tags || [],
        highlights: data.highlights || [],
        totalTests: 0,
        totalQuestions: 0,
        instantResults: data.instantResults ?? true,
        allowRetake: data.allowRetake ?? false,
        shuffleQuestions: data.shuffleQuestions ?? false,
        shuffleOptions: data.shuffleOptions ?? false,
        // Mark this doc explicitly as admin-authored public catalog content.
        // The public catalog query filters by `teacherId == ""` so the field
        // must exist; the Firestore rule keys public reads off this combo.
        teacherId: "",
        isDeleted: false,
        createdAt: now.toDate(),
        updatedAt: now.toDate(),
        createdBy,
    } as Omit<TestSeries, "id">;

    await setDoc(docRef, sanitizeData(seriesData));
    return slug;
}

// Backward compatibility
export const createTest = createTestSeries;

export async function updateTestSeries(data: UpdateTestSeriesInput): Promise<void> {
    const { id, ...updateData } = data;
    const docRef = doc(testsCollection, id);
    
    const updatePayload: Record<string, unknown> = {
        ...updateData,
        updatedAt: Timestamp.now(),
    };

    await updateDoc(docRef, sanitizeData(updatePayload));
}

// Backward compatibility
export const updateTest = updateTestSeries;

export async function deleteTestSeries(seriesId: string): Promise<void> {
    const batch = writeBatch(db);
    const seriesRef = doc(testsCollection, seriesId);
    
    // Delete all tests and their questions (this can be large, ideally handled by a cloud function)
    const testsSubCollection = collection(seriesRef, "tests");
    const testsSnapshot = await getDocs(testsSubCollection);
    
    for (const testDoc of testsSnapshot.docs) {
        const questionsSubCollection = collection(testDoc.ref, "questions");
        const questionsSnapshot = await getDocs(questionsSubCollection);
        questionsSnapshot.docs.forEach(q => batch.delete(q.ref));
        batch.delete(testDoc.ref);
    }
    
    batch.delete(seriesRef);
    await batch.commit();
}

// Backward compatibility
export const deleteTest = deleteTestSeries;

// --- Individual Tests within a Series ---

export async function getTestsInSeries(seriesId: string): Promise<Test[]> {
    const seriesRef = doc(testsCollection, seriesId);
    const testsSubCollection = collection(seriesRef, "tests");
    const q = query(testsSubCollection, orderBy("order", "asc"));
    const snapshot = await getDocs(q);
    return mapDocs<Test>(snapshot);
}

export async function getTestById(seriesId: string, testId: string): Promise<Test | null> {
    const testRef = doc(testsCollection, seriesId, "tests", testId);
    const snapshot = await getDoc(testRef);
    if (!snapshot.exists()) return null;
    return mapDoc<Test>(snapshot);
}

export async function createTestInSeries(data: CreateTestInput): Promise<string> {
    const testId = uuidv4();
    const testRef = doc(testsCollection, data.seriesId, "tests", testId);
    const now = Timestamp.now();
    const series = await getTestSeries(data.seriesId);

    const testData: Omit<Test, "id"> = {
        ...data,
        description: data.description || "",
        status: data.status || "draft",
        order: data.order || 0,
        totalQuestions: 0,
        sections: normalizeSections(data.sections) || [],
        instantResults: data.instantResults ?? series?.instantResults ?? true,
        allowRetake: data.allowRetake ?? series?.allowRetake ?? false,
        shuffleQuestions: data.shuffleQuestions ?? series?.shuffleQuestions ?? false,
        shuffleOptions: data.shuffleOptions ?? series?.shuffleOptions ?? false,
        createdAt: now.toDate(),
        updatedAt: now.toDate(),
    };

    await setDoc(testRef, sanitizeData(testData));
    
    // Update total tests in series
    const seriesRef = doc(testsCollection, data.seriesId);
    const tests = await getTestsInSeries(data.seriesId);
    await updateDoc(seriesRef, { totalTests: tests.length });
    
    return testId;
}

export async function updateTestInSeries(data: UpdateTestInput): Promise<void> {
    const { id, seriesId, ...updateData } = data;
    const testRef = doc(testsCollection, seriesId, "tests", id);
    
    const updatePayload = {
        ...updateData,
        sections: data.sections ? normalizeSections(data.sections) : undefined,
        updatedAt: Timestamp.now(),
    };

    await updateDoc(testRef, sanitizeData(updatePayload));
}

export async function deleteTestInSeries(seriesId: string, testId: string): Promise<void> {
    const testRef = doc(testsCollection, seriesId, "tests", testId);
    
    // Delete questions first
    const questionsSubCollection = collection(testRef, "questions");
    const questionsSnapshot = await getDocs(questionsSubCollection);
    const batch = writeBatch(db);
    questionsSnapshot.docs.forEach(q => batch.delete(q.ref));
    batch.delete(testRef);
    await batch.commit();
    
    // Update stats
    const seriesRef = doc(testsCollection, seriesId);
    const tests = await getTestsInSeries(seriesId);
    await updateDoc(seriesRef, { totalTests: tests.length });
}

// --- Questions ---

export async function getQuestionsByTestId(seriesId: string, testId: string): Promise<Question[]> {
    const questionsCollection = collection(db, "tests", seriesId, "tests", testId, "questions");
    const q = query(questionsCollection, orderBy("order", "asc"));
    const snapshot = await getDocs(q);
    return mapDocs<Question>(snapshot);
}

export async function createQuestion(data: CreateQuestionInput): Promise<string> {
    const questionId = uuidv4();
    const questionRef = doc(db, "tests", data.seriesId, "tests", data.testId, "questions", questionId);
    const now = Timestamp.now();

    let options = data.options;
    if (data.type === "mcq" && options) {
        options = options.map(opt => ({ ...opt, id: (opt as any).id || uuidv4() }));
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
    const testQuestions = await getQuestionsByTestId(data.seriesId, data.testId);
    const testRef = doc(db, "tests", data.seriesId, "tests", data.testId);
    await updateDoc(testRef, { totalQuestions: testQuestions.length });
    
    // Update series total questions
    const seriesRef = doc(db, "tests", data.seriesId);
    const allTests = await getTestsInSeries(data.seriesId);
    const totalSeriesQuestions = allTests.reduce((acc, t) => acc + (t.totalQuestions || 0), 0);
    await updateDoc(seriesRef, { totalQuestions: totalSeriesQuestions });
    
    return questionId;
}

export async function updateQuestion(data: UpdateQuestionInput): Promise<void> {
    const { id, seriesId, testId, ...updateData } = data;
    const questionRef = doc(db, "tests", seriesId, "tests", testId, "questions", id);
    
    let options = updateData.options;
    if (updateData.type === "mcq" && options) {
        options = options.map(opt => ({ ...opt, id: (opt as any).id || uuidv4() }));
    }

    const updatePayload = {
        ...updateData,
        options,
        updatedAt: Timestamp.now(),
    };

    await updateDoc(questionRef, sanitizeData(updatePayload));
}

export async function deleteQuestion(seriesId: string, testId: string, questionId: string): Promise<void> {
    const questionRef = doc(db, "tests", seriesId, "tests", testId, "questions", questionId);
    await deleteDoc(questionRef);
    
    // Update question counts
    const testQuestions = await getQuestionsByTestId(seriesId, testId);
    const testRef = doc(db, "tests", seriesId, "tests", testId);
    await updateDoc(testRef, { totalQuestions: testQuestions.length });

    // Update series total questions
    const seriesRef = doc(db, "tests", seriesId);
    const allTests = await getTestsInSeries(seriesId);
    const totalSeriesQuestions = allTests.reduce((acc, t) => acc + (t.totalQuestions || 0), 0);
    await updateDoc(seriesRef, { totalQuestions: totalSeriesQuestions });
}

export async function reorderQuestions(seriesId: string, testId: string, questionIds: string[]): Promise<void> {
    const batch = writeBatch(db);
    questionIds.forEach((id, index) => {
        const ref = doc(db, "tests", seriesId, "tests", testId, "questions", id);
        batch.update(ref, { order: index, updatedAt: Timestamp.now() });
    });
    await batch.commit();
}
