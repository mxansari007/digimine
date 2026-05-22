/**
 * Teacher-student enrollment types
 */

export type EnrollmentStatus = "active" | "banned" | "removed";

export interface TeacherEnrollment {
    id: string;
    studentId: string;
    studentEmail: string;
    studentName: string;
    rollNumber: string | null;
    enrolledAt: Date;
    status: EnrollmentStatus;
    totalAttempts: number;
    lastActiveAt: Date | null;
}

export interface CreateEnrollmentInput {
    studentId: string;
    studentEmail: string;
    studentName: string;
    rollNumber?: string;
}
