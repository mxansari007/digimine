"use client";

import {
    collection,
    doc,
    getDoc,
    getDocs,
    orderBy,
    query,
    where,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { Course, CourseEnrollment, CourseNoteChapter } from "@digimine/types";

const coursesCollection = collection(db, "courses");

function toDate(value: any): Date {
    if (!value) return new Date();
    if (typeof value.toDate === "function") return value.toDate();
    if (typeof value === "string") return new Date(value);
    if (value.seconds !== undefined) return new Date(value.seconds * 1000);
    return value instanceof Date ? value : new Date(value);
}

function mapCourseDoc(snapshot: any): Course {
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

function mapEnrollmentDoc(snapshot: any): CourseEnrollment {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        ...data,
        enrolledAt: toDate(data.enrolledAt),
        createdAt: toDate(data.createdAt),
        updatedAt: toDate(data.updatedAt),
    } as CourseEnrollment;
}

export async function getPublishedCourses(): Promise<Course[]> {
    const q = query(coursesCollection, where("status", "==", "published"), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(mapCourseDoc);
}

export async function getCourseBySlug(slug: string): Promise<Course | null> {
    const byId = await getDoc(doc(coursesCollection, slug));
    if (byId.exists()) {
        const course = mapCourseDoc(byId);
        return course.status === "published" ? course : null;
    }

    const q = query(coursesCollection, where("slug", "==", slug), where("status", "==", "published"));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    return mapCourseDoc(snapshot.docs[0]);
}

export async function getCourseChapters(courseId: string): Promise<CourseNoteChapter[]> {
    const chaptersRef = collection(db, "courses", courseId, "chapters");
    const snapshot = await getDocs(query(chaptersRef, orderBy("order", "asc")));
    return snapshot.docs.map((chapterDoc) => chapterDoc.data() as CourseNoteChapter);
}

export async function getCourseEnrollment(userId: string, courseId: string): Promise<CourseEnrollment | null> {
    const enrollmentId = `${userId}_${courseId}`;
    const snapshot = await getDoc(doc(db, "courseEnrollments", enrollmentId));
    if (!snapshot.exists()) return null;
    return mapEnrollmentDoc(snapshot);
}
