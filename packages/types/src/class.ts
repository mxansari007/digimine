/**
 * Teacher classes — a teacher can own many classes, each with its own
 * roster of students and its own invite code. Content (quizzes, tests,
 * contests, courses) is assigned to one or more classes via `classIds`.
 */

import type { EnrollmentStatus } from "./enrollment";

export interface Class {
    id: string;
    teacherId: string;            // assigned teacher (can be empty when institute hasn't assigned one yet)
    instituteId: string | null;   // when set, this class is institute-managed; only institute admin can structurally change it
    name: string;
    description: string | null;
    inviteCode: string;
    studentsCount: number;
    activeStudentsCount: number;
    isArchived: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface CreateClassInput {
    name: string;
    description?: string | null;
}

export interface UpdateClassInput {
    name?: string;
    description?: string | null;
    isArchived?: boolean;
}

/**
 * Enrollment subcollection at `classes/{classId}/students/{studentId}`.
 * Mirrors the legacy `teacher_enrollments/{teacherId}/students/{studentId}`
 * shape but keyed by class instead of teacher.
 */
export interface ClassEnrollment {
    id: string;
    classId: string;
    teacherId: string;
    studentId: string;
    studentEmail: string;
    studentName: string;
    rollNumber: string | null;
    enrolledAt: Date;
    status: EnrollmentStatus;
    totalAttempts: number;
    lastActiveAt: Date | null;
}

export interface CreateClassEnrollmentInput {
    studentId: string;
    studentEmail: string;
    studentName: string;
    rollNumber?: string;
}

/**
 * Summary stored on the user doc (`users/{uid}.classMemberships`) for fast
 * "my classes" lookups without a collection-group query. Kept in sync by
 * the enrollment APIs.
 */
export interface UserClassMembership {
    classId: string;
    teacherId: string;
    status: EnrollmentStatus;
    joinedAt: Date;
}
