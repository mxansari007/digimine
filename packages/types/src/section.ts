/**
 * Section · Group · Timetable model.
 *
 * A SECTION is a cohort of students within a University (e.g.
 * "B.Tech CSE 2022–26 · A"). A section is divided into GROUPS (G1, G2 …);
 * a student belongs to a group. A teacher's `Class` (see class.ts) teaches
 * one `subject` to the students of one or more groups of a section, on a
 * weekly `meetings` timetable.
 *
 * Why both: the SAME section is taught by many teachers (one subject each) —
 * so students see SUBJECTS (the section would otherwise repeat), while a
 * teacher sees SECTIONS (they teach the same subject across many sections).
 * Two or more groups can be combined into one class, merging their students.
 */

export interface Section {
    id: string;
    universityId: string;
    /** Display name within its program/year, e.g. "A" or "CSE-A". */
    name: string;
    /** e.g. "B.Tech CSE". */
    program: string | null;
    /** Graduating batch year, e.g. 2026. */
    batchYear: number | null;
    semester: number | null;
    /**
     * university + program + batchYear + name, normalised — used to find and
     * REUSE an existing section instead of creating a duplicate.
     */
    normalizedKey: string;
    groupCount: number;
    studentCount: number;
    /** uid of the teacher who first created the section. */
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface Group {
    id: string;
    sectionId: string;
    universityId: string;
    /** e.g. "G1". */
    name: string;
    /**
     * Students redeem this to join THIS group — which auto-enrolls them into
     * every class that targets the group.
     */
    inviteCode: string;
    studentCount: number;
    createdAt: Date;
    updatedAt: Date;
}

export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

/** One recurring weekly meeting of a class. */
export interface ClassMeeting {
    day: Weekday;
    /** "HH:mm", 24-hour. */
    startTime: string;
    /** "HH:mm", 24-hour. */
    endTime: string;
    /** Overrides the class's default room when set. */
    room: string | null;
}

/**
 * Group membership at `groups/{groupId}/members/{studentId}` (and mirrored
 * onto the user doc). The source of truth for who is in a group → and thus
 * which classes a student belongs to.
 */
export interface GroupMembership {
    groupId: string;
    sectionId: string;
    universityId: string;
    studentId: string;
    studentEmail: string;
    studentName: string;
    rollNumber: string | null;
    status: "active" | "removed";
    joinedAt: Date;
}

export interface CreateSectionInput {
    universityId: string;
    name: string;
    program?: string;
    batchYear?: number;
    semester?: number;
}

export interface CreateGroupInput {
    sectionId: string;
    name: string;
}

/**
 * A flattened cell for the student weekly timetable view — one per (class ×
 * meeting). Built by the timetable API from the student's classes' meetings.
 */
export interface TimetableEntry {
    classId: string;
    subject: string;
    teacherName: string;
    sectionName: string;
    groupName: string | null;
    day: Weekday;
    startTime: string;
    endTime: string;
    room: string | null;
}
