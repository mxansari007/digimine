/**
 * Teacher classes — a teacher can own many classes, each with its own
 * roster of students and its own invite code. Content (quizzes, tests,
 * contests, courses) is assigned to one or more classes via `classIds`.
 *
 * A class now also carries an optional SECTION / GROUP / SUBJECT / SCHEDULE
 * shape (see `section.ts`): a class teaches one `subject` to the students of
 * one or more `groupIds` of a `sectionId`, meeting on a weekly `meetings`
 * timetable. All of these are optional, so existing classes keep working.
 */

import type { EnrollmentStatus } from "./enrollment";
import type { ClassMeeting } from "./section";

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
    /** When true, this class can host Virtual Lab sessions. The teacher opts in
     *  at creation (editable later in settings); the lab entry point + the
     *  session/token APIs are inert for classes where this is not true. */
    labEnabled?: boolean;
    // ── Section / subject / schedule (new model; all optional for back-compat) ──
    /** University directory id (the teacher's college). */
    universityId?: string | null;
    /** Section (a cohort within the university) this class belongs to. */
    sectionId?: string | null;
    /**
     * Groups this class targets. More than one = a "combined" class whose
     * roster is the union of those groups' students.
     */
    groupIds?: string[];
    /**
     * Subject taught, e.g. "Data Structures". Shown to STUDENTS as the
     * primary label, because a section repeats across many subjects.
     */
    subject?: string | null;
    /** Default room; a meeting's own room overrides this. */
    room?: string | null;
    /** Weekly recurring meetings that build the student timetable. */
    meetings?: ClassMeeting[];
    createdAt: Date;
    updatedAt: Date;
}

export interface CreateClassInput {
    name: string;
    description?: string | null;
    universityId?: string;
    sectionId?: string;
    groupIds?: string[];
    subject?: string;
    room?: string | null;
    meetings?: ClassMeeting[];
}

export interface UpdateClassInput {
    name?: string;
    description?: string | null;
    isArchived?: boolean;
    subject?: string | null;
    room?: string | null;
    groupIds?: string[];
    meetings?: ClassMeeting[];
}

/**
 * Enrollment subcollection at `classes/{classId}/students/{studentId}`.
 * Mirrors the legacy `teacher_enrollments/{teacherId}/students/{studentId}`
 * shape but keyed by class instead of teacher.
 *
 * For group-based classes this stays the materialised roster (the union of
 * the class's groups' members) so all existing reads keep working; `groupId`
 * records which group brought the student in (null for direct/legacy joins).
 */
export interface ClassEnrollment {
    id: string;
    classId: string;
    teacherId: string;
    studentId: string;
    studentEmail: string;
    studentName: string;
    rollNumber: string | null;
    /** Group this enrollment came from, when the class is group-based. */
    groupId?: string | null;
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
    groupId?: string | null;
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
