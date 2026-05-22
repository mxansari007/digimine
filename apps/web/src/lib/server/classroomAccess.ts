import { adminAuth, adminDb } from "@/lib/firebase/admin";

export type ClassroomAccessResult =
    | { allowed: true; userId: string | null }
    | { allowed: false; status: number; error: string };

/**
 * Returns true if the student is actively enrolled in any class owned by
 * the given teacher. The new schema has classes/{classId}/students/{uid};
 * we also check the legacy teacher_enrollments path for backward
 * compatibility until the migration finishes.
 */
async function hasActiveClassEnrollmentForTeacher(
    teacherId: string,
    studentId: string
): Promise<boolean> {
    if (!teacherId || !studentId) return false;
    // 1. New shape: any class owned by this teacher where the user is active.
    const classesSnap = await adminDb
        .collection("classes")
        .where("teacherId", "==", teacherId)
        .get();
    for (const classDoc of classesSnap.docs) {
        const memberSnap = await classDoc.ref
            .collection("students")
            .doc(studentId)
            .get();
        if (memberSnap.exists && memberSnap.data()?.status === "active") {
            return true;
        }
    }
    // 2. Legacy fallback so pre-migration installs keep working.
    const legacy = await adminDb
        .collection("teacher_enrollments")
        .doc(teacherId)
        .collection("students")
        .doc(studentId)
        .get();
    return legacy.exists && legacy.data()?.status === "active";
}

export function toIsoDate(value: any): string | null {
    if (!value) return null;
    if (typeof value.toDate === "function") return value.toDate().toISOString();
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "string") return value;
    if (typeof value.seconds === "number") return new Date(value.seconds * 1000).toISOString();
    return null;
}

export async function getBearerUserId(req: Request): Promise<string | null> {
    const header = req.headers.get("authorization") || "";
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (!match) return null;
    const decoded = await adminAuth.verifyIdToken(match[1]);
    return decoded.uid;
}

export function isPublicApprovedTeacherContent(data: FirebaseFirestore.DocumentData | undefined): boolean {
    return data?.visibility === "published" || data?.visibility === "public";
}

export function isPublishedContent(data: FirebaseFirestore.DocumentData | undefined): boolean {
    return data?.status === "published" && data?.isDeleted !== true;
}

export async function hasActiveClassroomEnrollment(teacherId: string, studentId: string): Promise<boolean> {
    return hasActiveClassEnrollmentForTeacher(teacherId, studentId);
}

export async function assertClassroomEnrollment(req: Request, teacherId: string): Promise<ClassroomAccessResult> {
    const userId = await getBearerUserId(req);
    if (!userId) {
        return { allowed: false, status: 401, error: "Sign in to access this classroom." };
    }
    const allowed = await hasActiveClassroomEnrollment(teacherId, userId);
    if (!allowed) {
        return { allowed: false, status: 403, error: "You are not enrolled in this classroom." };
    }
    return { allowed: true, userId };
}

export async function assertTeacherContentAccess(
    req: Request,
    data: FirebaseFirestore.DocumentData | undefined,
    expectedTeacherId?: string | null,
    options?: { classId?: string | null }
): Promise<ClassroomAccessResult> {
    if (!data) return { allowed: false, status: 404, error: "Content not found." };
    if (!isPublishedContent(data)) return { allowed: false, status: 404, error: "Content not found." };

    const teacherId = data.teacherId || "";
    if (expectedTeacherId && teacherId !== expectedTeacherId) {
        return { allowed: false, status: 404, error: "Content not found." };
    }

    if (!teacherId || isPublicApprovedTeacherContent(data)) {
        return { allowed: true, userId: null };
    }

    // Class-scoped check: if the caller passed a specific classId, make sure
    // (a) the content is assigned to that class and (b) the user is actually
    // enrolled in it. For legacy content with no `classIds` we fall back to
    // the teacher-level enrollment check.
    const targetClassId = options?.classId || "";
    const contentClassIds: string[] = Array.isArray(data.classIds) ? data.classIds : [];

    if (targetClassId) {
        if (contentClassIds.length > 0 && !contentClassIds.includes(targetClassId)) {
            return { allowed: false, status: 404, error: "Content not found." };
        }
        const userId = await getBearerUserId(req).catch(() => null);
        if (!userId) {
            return { allowed: false, status: 401, error: "Sign in to access this class." };
        }
        const memberSnap = await adminDb
            .collection("classes")
            .doc(targetClassId)
            .collection("students")
            .doc(userId)
            .get();
        if (!memberSnap.exists || memberSnap.data()?.status !== "active") {
            return { allowed: false, status: 403, error: "You are not enrolled in this class." };
        }
        return { allowed: true, userId };
    }

    return assertClassroomEnrollment(req, teacherId);
}

