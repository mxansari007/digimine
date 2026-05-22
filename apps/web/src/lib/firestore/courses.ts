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
import type {
  Course,
  CourseEnrollment,
  CourseNoteChapter,
} from "@digimine/types";

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
    notesSummary: data.notesSummary || {
      chapterCount: 0,
      subtopicCount: 0,
      imageCount: 0,
      videoCount: 0,
    },
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

function isPublicCatalogCourse(
  course: Course & { teacherId?: string; visibility?: string }
): boolean {
  // Admin-authored content: no teacherId, just needs status published
  if (!course.teacherId && course.status === "published") return true;
  // Teacher-authored content: must have admin-approved visibility
  if (course.teacherId && course.visibility === "published") return true;
  return false;
}

function reviveCatalogCourse(raw: any): Course {
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
  } as Course;
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

export async function getPublishedCourses(): Promise<Course[]> {
  const payload = await fetchCatalogJson<{ items: any[] }>(`/api/catalog/courses`);
  if (!payload || !Array.isArray(payload.items)) return [];
  return payload.items.map(reviveCatalogCourse);
}

export async function getCourseBySlug(slug: string): Promise<Course | null> {
  const payload = await fetchCatalogJson<{ course: any }>(`/api/catalog/courses?slug=${encodeURIComponent(slug)}`);
  if (payload && payload.course) {
    return reviveCatalogCourse(payload.course);
  }

  const byId = await getDoc(doc(coursesCollection, slug));
  if (byId.exists()) {
    const course = mapCourseDoc(byId) as Course & { teacherId?: string; visibility?: string };
    return isPublicCatalogCourse(course) ? course : null;
  }

  const q = query(
    coursesCollection,
    where("slug", "==", slug),
    where("status", "==", "published")
  );
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  const course = snapshot.docs
    .map((item) => mapCourseDoc(item) as Course & { teacherId?: string; visibility?: string })
    .find(isPublicCatalogCourse);
  return course || null;
}

export async function getCourseChapters(
  courseId: string
): Promise<CourseNoteChapter[]> {
  const chaptersRef = collection(db, "courses", courseId, "chapters");
  const snapshot = await getDocs(query(chaptersRef, orderBy("order", "asc")));
  return snapshot.docs.map(
    (chapterDoc) => chapterDoc.data() as CourseNoteChapter
  );
}

export async function getCourseEnrollment(
  userId: string,
  courseId: string
): Promise<CourseEnrollment | null> {
  const enrollmentId = `${userId}_${courseId}`;
  const snapshot = await getDoc(doc(db, "courseEnrollments", enrollmentId));
  if (!snapshot.exists()) return null;
  return mapEnrollmentDoc(snapshot);
}
