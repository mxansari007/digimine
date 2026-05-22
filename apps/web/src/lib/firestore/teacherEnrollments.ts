"use client";

import {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    query,
    
    orderBy,
    Timestamp,
    type DocumentData,
} from "firebase/firestore";
import { db } from "../firebase/client";
import type { TeacherEnrollment } from "@digimine/types";

function toDate(value: any): Date {
    if (!value) return new Date();
    if (typeof value.toDate === "function") return value.toDate();
    if (typeof value === "string") return new Date(value);
    if (value.seconds !== undefined) return new Date(value.seconds * 1000);
    return value instanceof Date ? value : new Date(value);
}

function mapDoc(snapshot: DocumentData): TeacherEnrollment {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        ...data,
        enrolledAt: toDate(data.enrolledAt),
        lastActiveAt: data.lastActiveAt ? toDate(data.lastActiveAt) : null,
    } as TeacherEnrollment;
}

export function getEnrollmentsCollection(teacherId: string) {
    return collection(db, "teacher_enrollments", teacherId, "students");
}

export async function getTeacherEnrollments(teacherId: string): Promise<TeacherEnrollment[]> {
    const q = query(getEnrollmentsCollection(teacherId), orderBy("enrolledAt", "desc"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => mapDoc(d));
}

export async function getEnrollment(teacherId: string, studentId: string): Promise<TeacherEnrollment | null> {
    const snapshot = await getDoc(doc(getEnrollmentsCollection(teacherId), studentId));
    if (!snapshot.exists()) return null;
    return mapDoc(snapshot);
}

export async function createEnrollment(
    teacherId: string,
    studentId: string,
    data: {
        studentEmail: string;
        studentName: string;
        rollNumber?: string;
    }
): Promise<void> {
    const ref = doc(getEnrollmentsCollection(teacherId), studentId);
    const now = Timestamp.now();
    await setDoc(ref, {
        studentId,
        studentEmail: data.studentEmail,
        studentName: data.studentName,
        rollNumber: data.rollNumber || null,
        enrolledAt: now,
        status: "active",
        totalAttempts: 0,
        lastActiveAt: null,
    });
}

export async function updateEnrollmentStatus(
    teacherId: string,
    studentId: string,
    status: "active" | "banned" | "removed"
): Promise<void> {
    const ref = doc(getEnrollmentsCollection(teacherId), studentId);
    await updateDoc(ref, {
        status,
        updatedAt: Timestamp.now(),
    });
}

export async function getStudentEnrollments(studentId: string): Promise<{ teacherId: string; enrollment: TeacherEnrollment }[]> {
    const results: { teacherId: string; enrollment: TeacherEnrollment }[] = [];

    // Query all teacher_enrollments documents, then check their students subcollection
    const teachersSnapshot = await getDocs(collection(db, "teacher_enrollments"));

    for (const teacherDoc of teachersSnapshot.docs) {
        const enrollmentSnap = await getDoc(
            doc(db, "teacher_enrollments", teacherDoc.id, "students", studentId)
        );
        if (enrollmentSnap.exists()) {
            results.push({
                teacherId: teacherDoc.id,
                enrollment: mapDoc(enrollmentSnap),
            });
        }
    }

    return results;
}
