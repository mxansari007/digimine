"use client";

import {
    collection,
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
import { db } from "../firebase/client";
import type {
    Course,
    CourseNoteChapter,
    CourseNoteOutlineChapter,
    CourseNotesSummary,
    CourseStatus,
    CreateCourseInput,
    UpdateCourseInput,
} from "@digimine/types";

const coursesCollection = collection(db, "courses");

function toDate(value: any): Date {
    if (!value) return new Date();
    if (typeof value.toDate === "function") return value.toDate();
    if (typeof value === "string") return new Date(value);
    if (value.seconds !== undefined) return new Date(value.seconds * 1000);
    return value instanceof Date ? value : new Date(value);
}

function sanitizeData<T>(data: T): T {
    return JSON.parse(JSON.stringify(data));
}

function mapCourseDoc(snapshot: DocumentData): Course {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        ...data,
        price: Number(data.price || 0),
        tags: data.tags || [],
        notesOutline: data.notesOutline || [],
        notesSummary: data.notesSummary || { chapterCount: 0, subtopicCount: 0, imageCount: 0, videoCount: 0 },
        linkedTestSeriesIds: data.linkedTestSeriesIds || [],
        linkedQuizzes: data.linkedQuizzes || [],
        createdAt: toDate(data.createdAt),
        updatedAt: toDate(data.updatedAt),
    } as Course;
}

function prepareChapters(chapters: CourseNoteChapter[] = []): CourseNoteChapter[] {
    return chapters.map((chapter, chapterIndex) => ({
        ...chapter,
        order: chapterIndex,
        subtopics: (chapter.subtopics || []).map((subtopic, subtopicIndex) => ({
            ...subtopic,
            order: subtopicIndex,
            imageUrls: subtopic.imageUrls || [],
            videos: subtopic.videos || [],
            contentHtml: subtopic.contentHtml || "",
        })),
    }));
}

export function buildNotesOutline(chapters: CourseNoteChapter[] = []): CourseNoteOutlineChapter[] {
    return prepareChapters(chapters).map((chapter) => ({
        id: chapter.id,
        title: chapter.title,
        description: chapter.description || "",
        order: chapter.order,
        subtopics: (chapter.subtopics || []).map((subtopic) => ({
            id: subtopic.id,
            title: subtopic.title,
            summary: subtopic.summary || "",
            hasImages: (subtopic.imageUrls || []).length > 0,
            videoCount: (subtopic.videos || []).length,
            order: subtopic.order,
        })),
    }));
}

export function buildNotesSummary(chapters: CourseNoteChapter[] = []): CourseNotesSummary {
    const prepared = prepareChapters(chapters);
    return prepared.reduce(
        (summary, chapter) => ({
            chapterCount: summary.chapterCount + 1,
            subtopicCount: summary.subtopicCount + (chapter.subtopics || []).length,
            imageCount:
                summary.imageCount +
                (chapter.subtopics || []).reduce((total, subtopic) => total + (subtopic.imageUrls || []).length, 0),
            videoCount:
                summary.videoCount +
                (chapter.subtopics || []).reduce((total, subtopic) => total + (subtopic.videos || []).length, 0),
        }),
        { chapterCount: 0, subtopicCount: 0, imageCount: 0, videoCount: 0 }
    );
}

async function writeCourseChapters(courseId: string, chapters: CourseNoteChapter[] = []) {
    const chaptersRef = collection(db, "courses", courseId, "chapters");
    const existing = await getDocs(chaptersRef);
    const batch = writeBatch(db);

    existing.docs.forEach((chapterDoc) => batch.delete(chapterDoc.ref));
    prepareChapters(chapters).forEach((chapter) => {
        batch.set(doc(chaptersRef, chapter.id), sanitizeData(chapter));
    });

    await batch.commit();
}

export async function getAllCourses(filters?: { status?: CourseStatus }): Promise<Course[]> {
    const q = query(coursesCollection, orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);
    const courses = snapshot.docs.map(mapCourseDoc);
    return filters?.status ? courses.filter((course) => course.status === filters.status) : courses;
}

export async function getCourse(courseId: string): Promise<Course | null> {
    const snapshot = await getDoc(doc(coursesCollection, courseId));
    if (!snapshot.exists()) return null;

    const course = mapCourseDoc(snapshot);
    const chaptersSnapshot = await getDocs(query(collection(db, "courses", courseId, "chapters"), orderBy("order", "asc")));
    const chapters = chaptersSnapshot.docs.map((chapterDoc) => chapterDoc.data() as CourseNoteChapter);

    return { ...course, chapters };
}

export async function createCourse(data: CreateCourseInput, createdBy: string): Promise<string> {
    if (!data.slug) throw new Error("Slug is required for creating a course");

    const docRef = doc(coursesCollection, data.slug);
    const now = Timestamp.now();
    const chapters = prepareChapters(data.chapters || []);

    const courseData: Omit<Course, "id" | "chapters"> = {
        title: data.title,
        slug: data.slug,
        description: data.description || "",
        shortDescription: data.shortDescription || "",
        thumbnailURL: data.thumbnailURL || null,
        status: data.status || "draft",
        accessType: data.accessType || "free",
        price: data.accessType === "enrollment_required" ? data.price || 0 : 0,
        compareAtPrice: data.compareAtPrice || undefined,
        category: data.category || "",
        tags: data.tags || [],
        difficulty: data.difficulty || "beginner",
        estimatedHours: data.estimatedHours || 0,
        notesOutline: buildNotesOutline(chapters),
        notesSummary: buildNotesSummary(chapters),
        linkedTestSeriesIds: data.linkedTestSeriesIds || [],
        linkedQuizzes: data.linkedQuizzes || [],
        createdAt: now.toDate(),
        updatedAt: now.toDate(),
        createdBy,
    };

    await setDoc(docRef, sanitizeData(courseData));
    await writeCourseChapters(docRef.id, chapters);
    return docRef.id;
}

export async function updateCourse(data: UpdateCourseInput): Promise<void> {
    const { id, chapters, ...updateData } = data;
    const docRef = doc(coursesCollection, id);
    const payload: Record<string, unknown> = {
        ...updateData,
        updatedAt: Timestamp.now(),
    };

    if (chapters) {
        const prepared = prepareChapters(chapters);
        payload.notesOutline = buildNotesOutline(prepared);
        payload.notesSummary = buildNotesSummary(prepared);
    }

    await updateDoc(docRef, sanitizeData(payload));
    if (chapters) await writeCourseChapters(id, chapters);
}

export async function deleteCourse(courseId: string): Promise<void> {
    const chaptersRef = collection(db, "courses", courseId, "chapters");
    const chaptersSnapshot = await getDocs(chaptersRef);
    const batch = writeBatch(db);
    chaptersSnapshot.docs.forEach((chapterDoc) => batch.delete(chapterDoc.ref));
    batch.delete(doc(coursesCollection, courseId));
    await batch.commit();
}
